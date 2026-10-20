# KomissX — Backend

API do KomissX, construída com [NestJS](https://nestjs.com/) e TypeScript. Responsável por autenticação de contexto, regras de comissão, relatórios, permissões e consultas externas ao Metabase.

## Requisitos

- Node.js 18+
- npm

## Setup

```bash
npm install
```

Crie `.env` na raiz do `backend`, ou use `.metabase.query.env` para as configurações de consultas externas. O `ConfigModule` procura os arquivos nesta ordem:

1. `.env.development.local`
2. `.env.development`
3. `.env`
4. `.metabase.query.env`

Variáveis já presentes no ambiente do processo têm prioridade. Como a configuração de autenticação carrega `.env` durante a inicialização, mantenha as credenciais de retirada no `.env` ou em `.metabase.query.env` e evite duplicar uma variável com valores diferentes.

Para o fechamento semanal de retirada, configure no `.env` ou `.metabase.query.env`:

- `GOOGLE_SHEET_ID_MAO_RET` e `GOOGLE_SHEET_NAME_MAO_RET` para a planilha MAO;
- opcionalmente, `GOOGLE_SHEET_ID_REGIONAIS_RET` e `GOOGLE_SHEET_NAME_REGIONAIS_RET` para a planilha de regionais;
- `GOOGLE_CLIENT_EMAIL` e `GOOGLE_PRIVATE_KEY` da conta de serviço Google.

A conta de serviço precisa ter acesso de leitura às planilhas. Preserve os `\n` escapados na chave privada. Os caminhos dos arquivos são resolvidos a partir da pasta `backend`, independentemente do diretório de onde o processo foi iniciado. Reinicie a API após alterar os arquivos de ambiente. O Docker Compose de produção carrega `backend/.env`; valores mantidos somente em `.metabase.query.env` não são injetados no contêiner.

### Variáveis principais


| Variável                      | Uso                                                 |
| ----------------------------- | --------------------------------------------------- |
| `PORT`                        | Porta da API (padrão: `3000`)                       |
| `METABASE_INSTALACAO_TECNICO` | Endpoint público Metabase (relatório de instalação) |


> O TypeORM / Postgres está preparado no `AppModule`, mas ainda comentado. Quando for habilitar, configure também `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE`.

## Banco de dados (TypeORM + PostgreSQL)

O TypeORM está configurado no `AppModule` com `synchronize: false`.
O schema é gerenciado por migrations.

### Subir o Postgres (Docker)

```bash
docker compose up -d
```

# desenvolvimento (watch)
npm run start:dev

# produção
npm run build
npm run start:prod
```

A API sobe em `http://localhost:3000` (ou na porta definida em `PORT`).

## Testes

```bash
# unitários
npm run test

# watch
npm run test:watch

# cobertura
npm run test:cov

# e2e
npm run test:e2e
```



## Estrutura do projeto

```text
backend/src
├── main.ts                 # Bootstrap da aplicação
├── app.module.ts           # Módulo raiz (registra todos os módulos)
├── common/                 # Enums, interfaces e utilitários compartilhados
├── integrations/           # Infraestrutura compartilhada (Redis)
├── module/
│   └── configuracoes/      # Módulo de configurações (equipe, hierarquia, etc.)
├── users/
├── roles/
├── permissions/
├── reports/
├── commissions/
├── commission_rule/
└── commission_engine/
```



## Padrão de arquitetura

Cada funcionalidade segue o fluxo:

```text
Controller → Service → Repository
         ↘ DTO ↗
```


| Camada         | Responsabilidade                                                           |
| -------------- | -------------------------------------------------------------------------- |
| **Controller** | Recebe a requisição HTTP, valida entrada e devolve a resposta              |
| **Service**    | Contém a regra de negócio e o mapeamento para DTOs de resposta             |
| **Repository** | Isola o acesso a dados (banco ou serviço externo)                           |
| **DTO**        | Define o contrato de entrada (`Create` / `Update`) e de saída (`Response`) |




### Exemplo de pasta de um módulo

user/
├── controller/
│   └── index.controller.ts
├── service/
│   └── index.service.ts
├── dto/
│   ├── create.user.dto.ts
│   ├── update.user.dto
│   ├── repository/
│   └── index.user
└── index.module.ts

## (!) ATENÇÃO (!)

- Caso tenho mais de um arquivo na pasta; Uso o exemplo seguinte.

user/
├── service/
    └── user.service.ts
    └── user.gateway.service.ts

- Só vamos usar INDEX quando tiver somente UM arquivo na pasta.



### Regras importantes

- O **Controller** não fala com serviços externos ou banco diretamente — só chama o Service.
- O **Service** não monta chamada HTTP crua — usa o Repository.
- O **Repository** não aplica regra de negócio — só busca, cria, atualiza ou remove.
- Módulos novos devem ser registrados no `AppModule`.
- Infraestrutura compartilhada, como o Redis, fica em `integrations/` e é registrada pelo `AppModule`.



### Barrel `index.ts`

Quando uma pasta tiver muitos arquivos (ex.: `dto/`, `service/`, `controller/`), crie um `index.ts` nela para centralizar os exports.

Assim, em vez de importar arquivo por arquivo, você importa tudo pela pasta:

```ts
──dto/
  ├── create.user.dto.ts
  ├── update.user.dto.ts

// dto/index.ts
export * from './index.create.user.dto.ts
export * from './index.update.user.dto.ts
```



### Serviços externos

- **Metabase**: consulta de cards públicos para relatórios (ex.: instalação técnica).



## Scripts úteis


| Script              | Descrição                |
| ------------------- | ------------------------ |
| `npm run start:dev` | Sobe a API em modo watch |
| `npm run build`     | Compila para `dist/`     |
| `npm run lint`      | Roda o ESLint            |
| `npm run test`      | Testes unitários         |
| `npm run test:e2e`  | Testes end-to-end        |




## Contato / dúvidas

Para dúvidas sobre o backend, falar com:

- **Matheus Raposo**
- **Yan Oliveira**
