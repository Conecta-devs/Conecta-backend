# 🎓 Conecta Backend

> API do **Conecta**, uma plataforma digital voltada para a comunidade estudantil, construída com **NestJS**, **TypeScript**, **Prisma** e **MongoDB**.

O backend é responsável pela autenticação, regras de negócio e persistência dos dados da aplicação.

---

## 📌 Status do projeto

| Funcionalidade | Status |
|---|:---:|
| Estrutura inicial com NestJS | ✅ |
| Integração com MongoDB | ✅ |
| Prisma + MongoDB | ✅ |
| Cadastro de usuários | ✅ |
| Login com JWT | ✅ |
| Rotas protegidas por JWT | ✅ |
| Validação dos DTOs | ✅ |
| Refresh Token | ✅ |
| CRUD de posts/assuntos | ✅ |
| Grupos de estudo | ⬜ |
| Chat | | ⬜ |
| Mentorias | ⬜ |
| API de eventos e rodas de conversa | ✅ |
| Página da Agenda no frontend | ✅ |
| Integração com o frontend | ✅ |

> O projeto está em desenvolvimento. As funcionalidades marcadas como ⬜ ainda não foram implementadas.

---

## 🛠️ Tecnologias

- **Node.js** + **npm**
- **NestJS 12**
- **TypeScript**
- **Prisma 8 RC** (`prisma-next`)
- **@prisma/orm-mongo**
- **MongoDB** — MongoDB Atlas é recomendado
- **JWT** + **Passport**
- **bcrypt**
- **@nestjs/throttler** para limitar solicitações de recuperação
- **class-validator** + **class-transformer**
- **Vitest** + **Supertest**
- **Oxlint**

### Versões utilizadas no desenvolvimento

O projeto foi validado com:

- Node.js **24.x**
- npm **11.x**
- Prisma **8.0.0-rc.10**

> ⚠️ Este projeto utiliza o workflow atual do Prisma 8 RC. Tutoriais antigos do Prisma podem apresentar comandos diferentes dos utilizados aqui.

---

## 📋 Pré-requisitos

Antes de começar, instale:

- [Node.js](https://nodejs.org/) 20 ou superior
- npm
- Git
- Acesso a uma instância MongoDB
- Uma conta/cluster no MongoDB Atlas, caso utilize Atlas

Recomenda-se utilizar uma versão do Node compatível com a utilizada pela equipe durante o desenvolvimento.

---

# 🚀 Configuração do projeto

## 1. Clonar o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd conecta-backend
```

## 2. Instalar as dependências

```bash
npm install
```

O `npm install` utiliza o `package.json` e o `package-lock.json` para instalar as dependências do projeto.

---

## 3. Configurar as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto.

Se existir um `.env.example`, você pode copiá-lo.

### PowerShell

```powershell
Copy-Item .env.example .env
```

### `.env`

```env
DATABASE_URL="mongodb://usuario:senha@host:27017/test"
JWT_SECRET="seu-segredo-forte-e-unico"
PORT=3000
```

### Variáveis disponíveis

| Variável | Obrigatória | Descrição | Padrão |
|---|:---:|---|---|
| `DATABASE_URL` | ✅ | URL de conexão com o MongoDB | — |
| `JWT_SECRET` | ✅ | Segredo utilizado para assinar os JWTs | — |
| `PORT` | ❌ | Porta HTTP da API | `3000` |
| `AUTH_ALLOWED_ORIGINS` | ❌ | Origens explícitas permitidas para CORS e autenticação por cookie, separadas por vírgula | Mesma origem da requisição |
| `AUTH_COOKIE_SAME_SITE` | ❌ | Política SameSite do cookie de refresh (`lax` ou `none`; `none` exige HTTPS em produção) | `lax` |
| `RESEND_API_KEY` | ✅ para recuperação | Chave privada usada pelo backend para enviar e-mails pelo Resend | — |
| `RESEND_FROM_EMAIL` | ✅ para recuperação | Remetente autorizado/verificado no Resend | — |
| `FRONTEND_URL` | ✅ em produção | URL-base usada para montar o link `/reset-password`; produção exige HTTPS | `http://localhost:5173` fora de produção |

> 🔐 **Nunca coloque credenciais reais no repositório.**  
> O arquivo `.env` deve permanecer ignorado pelo Git.

---

# 🗄️ MongoDB + Prisma

O projeto utiliza **MongoDB** como banco de dados e o workflow **Prisma 8 RC + `prisma-next`** para trabalhar com o modelo de dados.

O contrato principal está localizado em:

```text
src/prisma/contract.prisma
```

A configuração do Prisma está em:

```text
prisma.config.ts
```

O cliente utilizado pela aplicação está em:

```text
src/prisma/db.ts
```

### Arquivos gerados pelo contrato

O comando de emissão gera:

```text
src/prisma/contract.json
src/prisma/contract.d.ts
```

Esses arquivos são gerados automaticamente e **não devem ser editados manualmente**.

---

## 🔄 Após alterar o contrato Prisma

Se você modificar:

```text
src/prisma/contract.prisma
```

gere novamente os arquivos derivados:

```bash
npx prisma contract emit
```

Depois, verifique se o banco está de acordo com o contrato:

### PowerShell

```powershell
npx prisma db verify --db "$env:DATABASE_URL"
```

### Bash / Linux / macOS

```bash
npx prisma db verify --db "$DATABASE_URL"
```

> ⚠️ **Não utilize `npx prisma generate` neste projeto.**  
> O workflow atual utiliza `contract emit` e o cliente configurado em `src/prisma/db.ts`.

---

# ▶️ Executando a aplicação

## Desenvolvimento

```bash
npm run start:dev
```

A API será iniciada, por padrão, em:

```text
http://localhost:3000
```

O modo `start:dev` utiliza watch mode e reinicia a aplicação automaticamente após alterações no código.

## Produção

Compile o projeto:

```bash
npm run build
```

Depois execute:

```bash
npm run start:prod
```

A porta pode ser alterada através da variável:

```env
PORT=3000
```

---

# 🔐 Autenticação

Atualmente, o backend possui autenticação baseada em **JWT**.

Fluxo:

```text
Cadastro
   ↓
Hash da senha com bcrypt
   ↓
MongoDB
   ↓
Login
   ↓
Validação da senha
   ↓
JWT
   ↓
Rotas protegidas
```

Os tokens de acesso possuem validade de **15 minutos**. O refresh token opaco é enviado somente em cookie `HttpOnly`, armazenado no banco apenas como hash e tem validade de **7 dias**. A renovação rotaciona o token; o anterior deixa de ser aceito.

---

## 👤 Cadastro

### Endpoint

```http
POST /auth/register
```

### Body

```json
{
  "email": "usuario@example.com",
  "name": "Nome do usuário",
  "password": "senha-com-no-minimo-8-caracteres"
}
```

### Regras atuais

- `email` deve ser válido
- `password` deve possuir pelo menos 8 caracteres
- `name` deve ser informado
- O email não pode estar cadastrado anteriormente

---

## 🔑 Login

### Endpoint

```http
POST /auth/login
```

### Body

```json
{
  "email": "usuario@example.com",
  "password": "senha-com-no-minimo-8-caracteres"
}
```

O login retorna um `accessToken` e define o cookie `conecta_refresh` com caminho `/api/auth`. O navegador não consegue ler esse cookie via JavaScript.

Exemplo de resposta:

```json
{
  "accessToken": "<JWT>",
  "user": {
    "email": "usuario@example.com",
    "name": "Nome do usuário"
  }
}
```

As operações `POST /auth/login`, `POST /auth/refresh` e `POST /auth/logout` exigem os headers `Origin` e `X-CSRF-Protection: 1`. O backend valida a origem da requisição. Como o frontend acessa a API pelo proxy same-origin `/api`, o padrão do cookie é `SameSite=Lax`. Em uma implantação cross-site, configure `AUTH_ALLOWED_ORIGINS` e `AUTH_COOKIE_SAME_SITE=none` com HTTPS.

## ♻️ Renovação e logout

### `POST /auth/refresh`

Recebe o refresh token pelo cookie e retorna um novo access token e os dados do usuário. O cookie de refresh é substituído após a rotação ser confirmada.

### `POST /auth/logout`

Revoga a sessão associada ao cookie atual, limpa o cookie e responde `204 No Content`. A revogação do refresh token não invalida access tokens já emitidos; eles permanecem válidos até expirarem.

## 🔐 Recuperação de senha

### `POST /auth/forgot-password`

Recebe `{ "email": "usuario@example.com" }` e responde `202 Accepted` com uma mensagem genérica, sem aguardar o provedor e sem revelar se a conta existe pela resposta. Quando a conta existe, um token aleatório de uso único é enviado ao e-mail; o banco armazena somente seu hash SHA-256. Tokens anteriores são substituídos e o token expira em 30 minutos. Falhas de entrega não expõem informações do provedor nem confirmam o envio ao cliente. O envio ocorre em memória e não é uma fila durável; uma parada do processo pode interrompê-lo.

### `POST /auth/reset-password`

Recebe `{ "token": "<token recebido por e-mail>", "password": "<nova senha>" }`. A senha precisa ter pelo menos 8 caracteres. O token expirado, inválido ou já consumido é rejeitado; após o consumo bem-sucedido, sessões de refresh existentes são revogadas e a senha é armazenada com bcrypt, como no cadastro.

Ambos os endpoints são limitados a 5 requisições por minuto pelo IP observado pelo Express e por instância do backend. O armazenamento padrão do limitador é em memória; em produção com múltiplas réplicas, configure um armazenamento compartilhado para que o limite seja efetivamente global. O projeto não configura atualmente `trust proxy`; atrás de um proxy reverso, as requisições podem compartilhar o IP do proxy até que a confiança nos encaminhamentos seja configurada explicitamente e com segurança.

Configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e, em produção, `FRONTEND_URL` antes de aceitar solicitações. O endereço remetente precisa pertencer a um domínio verificado no Resend. O backend não executa testes de entrega real automaticamente. A página `/reset-password` precisa existir no frontend para concluir o fluxo.

A coleção mantém um registro por usuário e a expiração é verificada pela aplicação; não há limpeza automática por TTL. O contrato define índices únicos para `userId` e `tokenHash`, mas a emissão do contrato não os aplica no MongoDB: o ambiente deve aplicar o contrato e confirmar esses índices antes de depender da unicidade em produção. Esta implementação não executou sincronização do banco. O consumo do token é condicionado em um único documento MongoDB. A atualização da senha incrementa `authVersion` por compare-and-set no documento do usuário; o refresh rejeita sessões com uma versão antiga, inclusive sessões criadas por um login concorrente que tenha lido a versão anterior. A revogação explícita das sessões continua sendo uma operação separada, sem transação multi-documento nesta arquitetura. Se uma etapa falhar depois do consumo, o usuário poderá precisar solicitar outro link. Access JWTs já emitidos não são revogados por essa operação e permanecem válidos até expirarem.

---

## 🛡️ Acessando uma rota protegida

Para acessar uma rota protegida, envie o JWT no header:

```http
Authorization: Bearer <accessToken>
```

---

## 👤 Perfil

### Endpoint

```http
GET /auth/profile
```

Essa rota exige um JWT válido.

O backend utiliza a estratégia Passport JWT para validar o token e disponibilizar os dados do usuário autenticado.

---

## 📅 Agenda de encontros

Todas as rotas abaixo exigem autenticação JWT. O organizador é definido pelo `sub` do token autenticado; `organizerId` não é aceito no corpo.

| Método | Rota | Regra |
|---|---|---|
| `GET` | `/agenda` | Lista encontros não cancelados por data de início crescente. |
| `GET` | `/agenda/:id` | Consulta um encontro ativo; IDs inválidos retornam `400` e encontros inexistentes ou cancelados retornam `404`. |
| `POST` | `/agenda` | Cria um evento (`kind: event`) ou roda de conversa (`kind: conversation`). |
| `PATCH` | `/agenda/:id` | Edita somente encontro ativo do próprio organizador. |
| `PATCH` | `/agenda/:id/cancel` | Cancela logicamente encontro ativo do próprio organizador. |
| `GET` | `/agenda/:id/participation/me` | Consulta somente a participação do usuário autenticado. |
| `PUT` | `/agenda/:id/participation/interest` | Define o interesse com `{ "interested": true }` ou `{ "interested": false }`. |
| `PUT` | `/agenda/:id/participation/attendance` | Define a presença com `{ "confirmed": true }` ou `{ "confirmed": false }`. |

`format` aceita `online` ou `in_person`. Encontros presenciais exigem `location` e não aceitam `meetingUrl`; encontros online não aceitam `location`, e `meetingUrl` é opcional. Datas devem ser ISO-8601 com fuso explícito e o término deve ser posterior ao início. Encontros cancelados não aparecem na listagem nem na consulta por ID e não podem ser editados ou cancelados novamente.

Se ainda não houver uma participação, o endpoint `GET` retorna `interested: false` e `confirmed: false` sem criar documento. As duas operações `PUT` atualizam somente seu próprio booleano. O upsert usa a chave composta declarada no contrato; a proteção contra duplicatas concorrentes depende de o índice único correspondente estar realmente aplicado no MongoDB, o que deve ser verificado antes de assumir essa garantia.

---

# 🧪 Testando a API

Você pode utilizar ferramentas como:

- Postman
- Insomnia
- Thunder Client
- Extensões REST do VS Code

### Fluxo recomendado

**1. Inicie o backend**

```bash
npm run start:dev
```

**2. Cadastre um usuário**

```http
POST http://localhost:3000/auth/register
```

**3. Faça login**

```http
POST http://localhost:3000/auth/login
```

**4. Copie o `accessToken` retornado.**

**5. Acesse o perfil**

```http
GET http://localhost:3000/auth/profile
```

Adicione:

```http
Authorization: Bearer <accessToken>
```

Se tudo estiver configurado corretamente, a rota deverá retornar os dados do usuário autenticado.

---

# 📁 Estrutura do projeto

```text
conecta-backend/
│
├── src/
│   ├── auth/
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   └── register.dto.ts
│   │   │
│   │   ├── jwt-auth/
│   │   │   └── jwt-auth.guard.ts
│   │   │
│   │   ├── jwt-strategy/
│   │   │   └── jwt-strategy.ts
│   │   │
│   │   ├── auth.controller.ts
│   │   ├── auth.module.ts
│   │   └── auth.service.ts
│   │
│   ├── prisma/
│   │   ├── contract.prisma
│   │   ├── contract.json
│   │   ├── contract.d.ts
│   │   └── db.ts
│   │
│   ├── app.controller.ts
│   ├── app.module.ts
│   └── main.ts
│
├── test/
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── prisma.config.ts
```

### Principais responsabilidades

| Arquivo/Pasta | Responsabilidade |
|---|---|
| `auth/` | Autenticação e autorização |
| `dto/` | Validação dos dados recebidos pela API |
| `jwt-auth/` | Guard para proteção de rotas |
| `jwt-strategy/` | Estratégia de autenticação JWT |
| `prisma/` | Contrato e acesso ao MongoDB |
| `main.ts` | Inicialização da aplicação e configurações globais |
| `app.module.ts` | Módulo principal do NestJS |
| `test/` | Testes da aplicação |

---

# 🧰 Comandos úteis

## npm

```bash
# Instalar dependências
npm install

# Desenvolvimento
npm run start:dev

# Executar normalmente
npm run start

# Compilar
npm run build

# Executar build
npm run start:prod

# Testes
npm test

# Testes em watch
npm run test:watch

# Testes end-to-end
npm run test:e2e

# Cobertura
npm run test:cov

# Lint
npm run lint

# Formatação
npm run format
```

## Prisma

```bash
# Emitir arquivos derivados do contrato
npx prisma contract emit

# Verificar o banco
npx prisma db verify --db "$env:DATABASE_URL"
```

> Os comandos de ambiente acima estão escritos para PowerShell. Em Linux/macOS, utilize `$DATABASE_URL` no lugar de `$env:DATABASE_URL`.

---

# 🌿 Fluxo de desenvolvimento com Git

Evite trabalhar diretamente na branch principal.

## 1. Atualizar sua branch

```bash
git pull
```

## 2. Criar uma branch para sua alteração

```bash
git checkout -b feature/nome-da-feature
```

Exemplos:

```bash
git checkout -b feature/study-groups
git checkout -b feature/posts
git checkout -b fix/auth-validation
```

## 3. Verificar as alterações

```bash
git status
```

## 4. Adicionar os arquivos

```bash
git add .
```

## 5. Criar o commit

```bash
git commit -m "feat: adiciona grupos de estudo"
```

## 6. Enviar a branch

```bash
git push -u origin feature/nome-da-feature
```

## 7. Pull Request

Depois do `push`, abra um **Pull Request** para revisão da equipe antes de integrar a alteração à branch principal.

---

# 📝 Padrão de commits

Preferencialmente, utilize **Conventional Commits**.

Exemplos:

```text
feat: adiciona cadastro de usuários
fix: corrige validação do login
test: adiciona testes para autenticação
docs: atualiza README
refactor: reorganiza módulo de autenticação
chore: atualiza dependências
```

Tipos mais utilizados:

| Tipo | Uso |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `test` | Testes |
| `docs` | Documentação |
| `refactor` | Refatoração |
| `chore` | Manutenção/configuração |

---

# 🔒 Segurança

Nunca faça commit de:

```text
.env
```

ou de qualquer arquivo contendo:

- Senhas do MongoDB
- `JWT_SECRET` real
- Tokens
- Chaves de API
- Credenciais de serviços

O `.gitignore` deve conter:

```gitignore
.env
.env.*
!.env.example
```

Para compartilhar configurações com a equipe, utilize `.env.example` **sem credenciais reais**.

---

# 👥 Equipe

| Integrante |
|---|
| Kauan Matheus Martins |
| Matheus Alexandre Pereira |
| Matheus Marra Barbosa |
| Mike Ensergueix |

---

## 📄 Licença

Projeto acadêmico desenvolvido pela equipe **Conecta**.
