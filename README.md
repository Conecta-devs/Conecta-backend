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
| Refresh Token | ⬜ |
| CRUD de posts/assuntos | ⬜ |
| Grupos de estudo | ⬜ |
| Mentorias | ⬜ |
| Eventos e rodas de conversa | ⬜ |
| Integração com o frontend | ⬜ |

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

Os tokens de acesso atualmente possuem validade de **15 minutos**.

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

O login retorna um `accessToken`.

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
