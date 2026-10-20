import { API } from "@/lib/axios";

export type StatusConciliacao = "aprovado" | "corrigido" | "reprovado";

export type RetiradaRow = {
  id: string;
  numero_ordem_servico: string;
  codigo_cliente: string;
  estado: string;
  cidade: string;
  vendedor: string;
  conta: "amazonet" | "mania";
  encontrado_na_planilha: boolean;
  pago: boolean;
  statusConciliacao?: StatusConciliacao;
  [key: string]: unknown;
};

export type BuscarRetiradaParams = {
  dataInicio: string;
  dataFim: string;
  empresa?: "amazonet" | "mania";
};

export class RetiradaService {
  /**
   * Busca as retiradas do Metabase conciliadas com as planilhas.
   */
  static async buscar(params: BuscarRetiradaParams): Promise<RetiradaRow[]> {
    const response = await API.get<{ data: RetiradaRow[] }>("/reports/retiradas", { params });
    const dados = response.data?.data ?? [];

    // Mapeia garantindo o statusConciliacao inicial caso o backend não retorne
    return dados.map((item) => ({
      ...item,
      statusConciliacao: item.statusConciliacao ?? (item.pago ? "aprovado" : "reprovado"),
    }));
  }

  /**
   * Atualiza o status de conciliação de um registro específico no backend.
   */
  static async atualizarStatus(
    id: string,
    statusConciliacao: StatusConciliacao
  ): Promise<{ success: boolean }> {
    const response = await API.patch<{ success: boolean }>(`/reports/retiradas/${id}/status`, {
      statusConciliacao,
      pago: statusConciliacao === "aprovado" || statusConciliacao === "corrigido",
    });
    return response.data;
  }
}