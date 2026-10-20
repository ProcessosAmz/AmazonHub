import { useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, CheckSquare, Download, FileText, Loader2, Plus, Search, Wrench, XCircle } from "lucide-react";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RetiradaService, type RetiradaRow } from "@/service/retiradaService";
import { ConfigService } from "@/config/ConfigService";

type Rules = {
  fechamento_semanal: {
    retirada_estado: Record<string, number>;
  };
};

export type StatusConciliacao = "aprovado" | "corrigido" | "reprovado";

export interface RetiradaRowComStatus extends RetiradaRow {
  statusConciliacao: StatusConciliacao;
}

const REGRAS_PADRAO_RETIRADA: Record<string, number> = {
  AM: 35,
  PA: 30,
};

const UF_POR_CIDADE: Record<string, string> = {
  "santarem": "PA", "alenquer": "PA", "maraba": "PA", "prainha": "PA",
  "monte alegre": "PA", "obidos": "PA", "oriximina": "PA", "belterra": "PA",
  "mojui dos campos": "PA", "itaituba": "PA", "curua": "PA", "uruara": "PA",
  "alter do chao": "PA", "manaus": "AM", "presidente figueiredo": "AM",
  "manacapuru": "AM", "rio preto da eva": "AM", "iranduba": "AM",
  "parintins": "AM", "itacoatiara": "AM",
};

const normalizarCidade = (cidade: unknown) => String(cidade ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
  .replace(/\s*\([a-z]{2,3}\)\s*$/i, "");

const TECNICOS_RETIRADA = [
  "Wadison Oliveira Dos Santos",
  "Weverton Oliveira Dos Santos",
  "Nadinei Dos Santos Mota",
];
const ehServicoLL = (row: RetiradaRow) =>
  [row.vendedor, row.usuario_fechamento]
    .some((tecnico) => String(tecnico ?? "").toUpperCase().includes("_TEC_LL"));
const CAMPO_DIALOG = "w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm text-white";

const isoHoje = new Date().toISOString().slice(0, 10);
const isoInicioSemana = () => {
  const data = new Date();
  const dia = data.getDay();
  data.setDate(data.getDate() - (dia === 0 ? 6 : dia - 1));
  return data.toISOString().slice(0, 10);
};

const moeda = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Retirada() {
  const [dataInicio, setDataInicio] = useState(isoInicioSemana());
  const [dataFim, setDataFim] = useState(isoHoje);
  const [empresa, setEmpresa] = useState<"" | "amazonet" | "mania">("");
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<RetiradaRowComStatus[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [dialogAdicionarAberto, setDialogAdicionarAberto] = useState(false);
  const [novaOs, setNovaOs] = useState({
    codigoCliente: "", numeroOs: "", tecnico: "", statusAuditoria: "APROVADO",
    dataConclusao: isoHoje, estado: "AM",
  });
  const [erroNovaOs, setErroNovaOs] = useState("");

  const carregar = async () => {
    setLoading(true);
    setErro("");
    try {
      // 1. Carrega relatórios do Metabase e Planilhas no backend
      const dados = await RetiradaService.buscar({
        dataInicio,
        dataFim,
        ...(empresa ? { empresa } : {}),
      });

      // 2. Carrega configurações/regras com fallback seguro
      let configuracaoRules: Rules;
      try {
        const configLoaded = await ConfigService.getInstance().loadConfigurations();
        configuracaoRules = configLoaded as Rules;
      } catch (configError) {
        console.warn("Falha ao carregar regras da API. Usando regras padrão local.", configError);
        configuracaoRules = {
          fechamento_semanal: {
            retirada_estado: REGRAS_PADRAO_RETIRADA,
          },
        };
      }
      setRules(configuracaoRules);

      // 3. Confronta dados: Metabase vs Planilha
      // Se row.pago já vem true da conciliação do backend (ou campo equivalente), iniciamos como "aprovado"
      const dadosConciliados: RetiradaRowComStatus[] = dados.map((row) => ({
        ...row,
        statusConciliacao: row.pago ? "aprovado" : "reprovado",
      }));

      setRows(dadosConciliados);
    } catch (error) {
      const mensagem = isAxiosError<{ message?: string | string[] }>(error)
        ? error.response?.data?.message
        : undefined;
      setErro(
        typeof mensagem === "string"
          ? mensagem
          : Array.isArray(mensagem)
            ? mensagem.join(" ")
            : error instanceof Error
              ? error.message
              : "Não foi possível carregar o fechamento de retirada.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Alteração manual de status (Aprovado / Corrigido / Reprovado)
  const handleStatusChange = (id: string | number, novoStatus: StatusConciliacao) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              statusConciliacao: novoStatus,
              pago: novoStatus === "aprovado" || novoStatus === "corrigido",
            }
          : row
      )
    );
  };

  const adicionarOs = () => {
    if (!novaOs.codigoCliente.trim() || !novaOs.numeroOs.trim() || !novaOs.tecnico || !novaOs.dataConclusao) {
      setErroNovaOs("Preencha os campos obrigatórios para adicionar a O.S.");
      return;
    }
    const statusConciliacao: StatusConciliacao = novaOs.statusAuditoria === "APROVADO" ? "aprovado" : "reprovado";
    setRows((prev) => [{
      id: `manual-${Date.now()}`, numero_ordem_servico: novaOs.numeroOs.trim(), codigo_cliente: novaOs.codigoCliente.trim(),
      estado: novaOs.estado, cidade: "",
      usuario_fechamento: novaOs.tecnico, vendedor: novaOs.tecnico, status_auditoria: novaOs.statusAuditoria,
      data_termino_executado: novaOs.dataConclusao, conta: "amazonet", encontrado_na_planilha: false,
      pago: statusConciliacao === "aprovado", statusConciliacao,
    }, ...prev]);
    setNovaOs({ codigoCliente: "", numeroOs: "", tecnico: "", statusAuditoria: "APROVADO", dataConclusao: isoHoje, estado: "AM" });
    setErroNovaOs("");
    setDialogAdicionarAberto(false);
  };

  const gerarDocumento = (recibo = false) => {
    const linhas = (recibo
      ? dadosFiltrados.filter((row) => row.statusConciliacao === "aprovado" || row.statusConciliacao === "corrigido")
      : dadosFiltrados);
    if (!linhas.length) {
      window.alert(recibo ? "Não há O.S. aprovadas ou corrigidas para gerar recibo." : "Não há O.S. para gerar relatório.");
      return;
    }
    const documento = new jsPDF({ orientation: "landscape" });
    documento.setFontSize(16);
    documento.text(recibo ? "Recibo de retirada" : "Relatório de retirada", 14, 16);
    documento.setFontSize(10);
    documento.text(`Período: ${dataInicio} a ${dataFim} | O.S.: ${linhas.length}`, 14, 23);
    autoTable(documento, {
      startY: 28,
      head: [["QT OS", "O.S.", "Cliente", "Estado", "Responsável", "Status", "Valor"]],
      body: linhas.map((row, index) => [
        String(index + 1), row.numero_ordem_servico || "-", row.codigo_cliente || "-",
        estadoDaLinha(row), String(row.usuario_fechamento ?? "-") || "-",
        row.statusConciliacao.toUpperCase(), moeda(row.statusConciliacao === "reprovado" ? 0 : calcularValorRow(row)),
      ]),
      styles: { fontSize: 8 },
    });
    if (recibo) {
      const finalY = (documento as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 32;
      documento.text(`Total: ${moeda(linhas.reduce((total, row) => total + calcularValorRow(row), 0))}`, 14, finalY + 8);
    }
    documento.save(recibo ? "recibo-retirada.pdf" : "relatorio-retirada.pdf");
  };

  // Filtro global da tabela
  const dadosFiltrados = useMemo(() => {
    return rows.filter((row) => {
      const texto = `${row.numero_ordem_servico} ${row.codigo_cliente} ${row.cidade} ${row.estado} ${row.vendedor} ${String(row.usuario_fechamento ?? "")}`.toLowerCase();
      return texto.includes(busca.toLowerCase());
    });
  }, [rows, busca]);

  // Cálculo de valor com base no estado (AM: 35, PA: 30)
  const valorPorEstado = rules?.fechamento_semanal.retirada_estado ?? REGRAS_PADRAO_RETIRADA;
  const calcularValorRow = (row: RetiradaRow) => {
    const estadoInformado = String(row.estado ?? "").trim().toUpperCase();
    const uf = valorPorEstado[estadoInformado] !== undefined
      ? estadoInformado
      : UF_POR_CIDADE[normalizarCidade(row.cidade)] ?? "";
    return valorPorEstado[uf] ?? 0;
  };

  const estadoDaLinha = (row: RetiradaRow) => {
    const estadoInformado = String(row.estado ?? "").trim().toUpperCase();
    return valorPorEstado[estadoInformado] !== undefined
      ? estadoInformado
      : UF_POR_CIDADE[normalizarCidade(row.cidade)] ?? "-";
  };

  // Registros elegíveis para pagamento (Aprovados ou Corrigidos)
  const aptosAPagar = useMemo(() => {
    return dadosFiltrados.filter(
      (row) => row.statusConciliacao === "aprovado" || row.statusConciliacao === "corrigido"
    );
  }, [dadosFiltrados]);

  const totalGeralPagar = useMemo(() => {
    return aptosAPagar.reduce((sum, row) => sum + calcularValorRow(row), 0);
  }, [aptosAPagar, valorPorEstado]);

  // --- AGRUPAMENTO: SERVIÇOS LL (vendedor contendo 'tec_ll') ---
  const servicosLL = useMemo(() => {
    return dadosFiltrados.filter(ehServicoLL);
  }, [dadosFiltrados]);

  const aptosAPagarLL = useMemo(() => {
    return servicosLL.filter(
      (row) => row.statusConciliacao === "aprovado" || row.statusConciliacao === "corrigido"
    );
  }, [servicosLL]);

  const totalLLPagar = useMemo(() => {
    return aptosAPagarLL.reduce((sum, row) => sum + calcularValorRow(row), 0);
  }, [aptosAPagarLL, valorPorEstado]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-950 p-6 text-slate-100">
      <div>
        <h1 className="text-2xl font-bold">Fechamento Semanal - Retirada</h1>
        <p className="mt-1 text-sm text-slate-400">
          Conciliação do relatório Metabase com a planilha de entregas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setErroNovaOs(""); setDialogAdicionarAberto(true); }} className="inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800">
          <Plus size={16} /> Adicionar O.S.
        </button>
        <button type="button" onClick={() => gerarDocumento()} disabled={!dadosFiltrados.length} className="inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
          <FileText size={16} /> Gerar relatório
        </button>
        <button type="button" onClick={() => gerarDocumento(true)} disabled={!aptosAPagar.length} className="inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
          <Download size={16} /> Gerar recibo
        </button>
      </div>

      {/* Painel de Filtros */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-5">
        <label className="text-xs text-slate-400">
          Data inicial
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          Data final
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          Empresa
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value as typeof empresa)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm text-white"
          >
            <option value="">Todas</option>
            <option value="amazonet">Amazonet</option>
            <option value="mania">Mania</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Buscar
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="OS, cliente, cidade, técnico ou usuário de fechamento"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-sm text-white"
          />
        </label>
        <button
          onClick={() => void carregar()}
          disabled={loading}
          className="mt-auto flex h-10 items-center justify-center gap-2 rounded bg-emerald-600 px-4 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
          Consultar
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">
          <AlertCircle size={17} />
          {erro}
        </div>
      )}

      {/* Cards de Resumo Geral */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Registros no relatório</p>
          <strong className="text-2xl">{dadosFiltrados.length}</strong>
        </div>
        <div className="rounded-xl border border-emerald-900 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Aprovados / Corrigidos (Pagar)</p>
          <strong className="text-2xl text-emerald-400">{aptosAPagar.length}</strong>
        </div>
        <div className="rounded-xl border border-emerald-900 bg-slate-900 p-4">
          <p className="text-xs text-slate-400">Total a pagar</p>
          <strong className="text-2xl text-emerald-400">{moeda(totalGeralPagar)}</strong>
        </div>
      </div>

      {/* Card Especial de Agrupamento: Serviços LL */}
      {servicosLL.length > 0 && (
        <div className="space-y-3 rounded-xl border border-sky-800/60 bg-sky-950/30 p-4">
          <div className="flex items-center gap-2 font-semibold text-sky-400">
            <Wrench size={18} />
            <span>Serviços_L&amp;L</span>
          </div>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <div className="rounded-lg border border-sky-900/50 bg-slate-900/80 p-3">
              <p className="text-xs text-slate-400">Total Registros LL</p>
              <strong className="text-xl text-sky-200">{servicosLL.length}</strong>
            </div>
            <div className="rounded-lg border border-sky-900/50 bg-slate-900/80 p-3">
              <p className="text-xs text-slate-400">Pagas (Aprovado/Corrigido)</p>
              <strong className="text-xl text-emerald-400">{aptosAPagarLL.length}</strong>
            </div>
            <div className="rounded-lg border border-sky-900/50 bg-slate-900/80 p-3">
              <p className="text-xs text-slate-400">Total a Pagar LL</p>
              <strong className="text-xl text-emerald-400">{moeda(totalLLPagar)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Tabela de Conciliação com Alteração de Status */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">QT</th>
              <th className="p-3">OS</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {dadosFiltrados.map((row, index) => {
              const isLL = ehServicoLL(row);
              const responsavel = String(row.usuario_fechamento ?? "").trim();
              const valorCalculado = calcularValorRow(row);
              const devePagar = row.statusConciliacao === "aprovado" || row.statusConciliacao === "corrigido";

              return (
                <tr key={row.id} className={`text-slate-300 ${isLL ? "bg-sky-950/20" : ""}`}>
                  <td className="p-3 text-center tabular-nums">{index + 1}</td>
                  <td className="p-3 font-mono">{row.numero_ordem_servico || "-"}</td>
                  <td className="p-3">{row.codigo_cliente || "-"}</td>
                  <td className="p-3">
                    {estadoDaLinha(row)}
                  </td>
                  <td className="p-3 font-medium">
                    {responsavel || "-"}
                    {isLL && (
                      <span className="ml-2 rounded border border-sky-700/50 bg-sky-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                        LL
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={row.statusConciliacao}
                        onChange={(e) =>
                          handleStatusChange(row.id, e.target.value as StatusConciliacao)
                        }
                        className={`rounded border bg-slate-800 p-1 text-xs font-semibold ${
                          row.statusConciliacao === "aprovado"
                            ? "border-emerald-700 text-emerald-400"
                            : row.statusConciliacao === "corrigido"
                              ? "border-sky-700 text-sky-400"
                              : "border-rose-700 text-rose-400"
                        }`}
                      >
                        <option value="aprovado">Aprovado</option>
                        <option value="corrigido">Corrigido</option>
                        <option value="reprovado">Reprovado</option>
                      </select>

                      {row.statusConciliacao === "aprovado" && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle2 size={14} /> PAGO
                        </span>
                      )}
                      {row.statusConciliacao === "corrigido" && (
                        <span className="inline-flex items-center gap-1 text-xs text-sky-400">
                          <CheckSquare size={14} /> PAGO (CORRIGIDO)
                        </span>
                      )}
                      {row.statusConciliacao === "reprovado" && (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-400">
                          <XCircle size={14} /> NÃO PAGO
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {devePagar ? moeda(valorCalculado) : moeda(0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {dadosFiltrados.length === 0 && !loading && (
          <p className="p-8 text-center text-sm text-slate-500">Nenhum registro encontrado.</p>
        )}
      </div>

      <Dialog open={dialogAdicionarAberto} onOpenChange={setDialogAdicionarAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-slate-800 bg-[#0b0f19] text-slate-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar O.S.</DialogTitle>
            <DialogDescription className="text-slate-400">
              A ordem entra só neste fechamento, na empresa Amazonet.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); adicionarOs(); }}>
            <label className="space-y-1 text-xs text-slate-400">
              Código do cliente
              <input className={CAMPO_DIALOG} value={novaOs.codigoCliente} onChange={(event) => setNovaOs({ ...novaOs, codigoCliente: event.target.value })} />
            </label>
            <label className="space-y-1 text-xs text-slate-400">
              Número da O.S.
              <input className={CAMPO_DIALOG} value={novaOs.numeroOs} onChange={(event) => setNovaOs({ ...novaOs, numeroOs: event.target.value })} />
            </label>
            <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">
              Técnico
              <select className={CAMPO_DIALOG} value={novaOs.tecnico} onChange={(event) => setNovaOs({ ...novaOs, tecnico: event.target.value })}>
                <option value="">Selecione...</option>
                {TECNICOS_RETIRADA.map((tecnico) => <option key={tecnico} value={tecnico}>{tecnico}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">
              Status da auditoria
              <select className={CAMPO_DIALOG} value={novaOs.statusAuditoria} onChange={(event) => setNovaOs({ ...novaOs, statusAuditoria: event.target.value })}>
                <option value="APROVADO">APROVADO</option>
                <option value="PENDENTE">PENDENTE</option>
                <option value="REPROVADO">REPROVADO</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-400">
              Data de conclusão
              <input type="date" className={CAMPO_DIALOG} value={novaOs.dataConclusao} onChange={(event) => setNovaOs({ ...novaOs, dataConclusao: event.target.value })} />
            </label>
            <label className="space-y-1 text-xs text-slate-400 sm:col-span-2">
              Estado
              <select className={CAMPO_DIALOG} value={novaOs.estado} onChange={(event) => setNovaOs({ ...novaOs, estado: event.target.value })}>
                <option value="AM">AM</option>
                <option value="PA">PA</option>
              </select>
            </label>
            {erroNovaOs && <p className="text-sm text-rose-400 sm:col-span-2">{erroNovaOs}</p>}
            <DialogFooter className="gap-2 sm:col-span-2">
              <button type="button" onClick={() => setDialogAdicionarAberto(false)} className="rounded border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800">Cancelar</button>
              <button type="submit" className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500">Adicionar</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
