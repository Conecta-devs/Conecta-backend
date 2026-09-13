# Conecta Backend

API do Conecta, construída com NestJS e TypeScript. O projeto fornece autenticação de usuários com JWT e persistência em MongoDB por meio do workflow Prisma Next.

## Tecnologias

- Node.js e npm
- NestJS 12
- TypeScript
- Prisma 8 RC (`prisma-next` e `@prisma/orm-mongo`)
- MongoDB, recomendado MongoDB Atlas
- JWT e Passport para autenticação
- bcrypt para hash de senhas
- Vitest, Supertest e Oxlint

## Pré-requisitos

Antes de começar, instale:

- Node.js 20 ou superior
- npm
- Git
- Acesso a uma instância MongoDB 8 ou superior

O projeto foi validado com Node.js 24 e Prisma `8.0.0-rc.10`.

## Primeira configuração

Depois de clonar o repositório:

```bash
git clone <URL_DO_REPOSITORIO>
cd conecta-backend
npm install
```

Crie um arquivo `.env` na raiz do projeto. Você pode usar `.env.example` como referência:

```env
DATABASE_URL="mongodb://usuario:senha@host:27017/test"
JWT_SECRET="gere-um-segredo-forte-e-unico"
```

Cada integrante deve configurar suas próprias credenciais e variáveis de ambiente. Nunca inclua credenciais reais no README, em commits ou em mensagens de pull request.

## Configuração do ambiente

### MongoDB

`DATABASE_URL` deve ser uma URL MongoDB válida e incluir o nome do banco no caminho, por exemplo:

```env
DATABASE_URL="mongodb://usuario:senha@host:27017/conecta"
```

Para MongoDB Atlas, use a string de conexão fornecida pelo Atlas e confirme que o endereço IP está liberado na lista de acesso do cluster. O runtime atual aceita `mongodb://` e `mongodb+srv://`; a URL precisa ser compatível com o parser do runtime e conter um banco definido.

### JWT

`JWT_SECRET` é usado para assinar os tokens de acesso. Use um valor longo, aleatório e diferente em cada ambiente.

Os tokens emitidos atualmente expiram em 15 minutos.

## Banco de dados e Prisma

Este projeto utiliza Prisma 8 RC com o workflow `prisma-next` e `@prisma/orm-mongo`.

O contrato principal fica em `src/prisma/contract.prisma`. Os arquivos gerados que acompanham o contrato são:

- `src/prisma/contract.json`
- `src/prisma/contract.d.ts`

Depois de alterar o contrato, regenere esses arquivos:

```bash
npx prisma contract emit
```

Para verificar se o banco está de acordo com o contrato:

```powershell
npx prisma db verify --db "$env:DATABASE_URL"
```

Não use tutoriais antigos que indiquem `npx prisma generate` para este projeto. O workflow atual usa `contract emit` e o cliente definido em `src/prisma/db.ts`.

## Executando o projeto

### Desenvolvimento

```bash
npm run start:dev
```

A API fica disponível em `http://localhost:3000`.

### Produção

```bash
npm run build
npm run start:prod
```

É possível alterar a porta usando `PORT`:

```env
PORT=3000
```

## Autenticação

### Registrar usuário

`POST /auth/register`

```json
{
  "email": "usuario@example.com",
  "name": "Nome do usuário",
  "password": "senha-com-no-minimo-8-caracteres"
}
```

### Fazer login

`POST /auth/login`

```json
{
  "email": "usuario@example.com",
  "password": "senha-com-no-minimo-8-caracteres"
}
```

O login retorna um `accessToken`. Para acessar uma rota protegida, envie o token no cabeçalho:

```http
Authorization: Bearer <accessToken>
```

### Consultar perfil

`GET /auth/profile`

Essa rota exige um token JWT válido.

## Estrutura do projeto

```text
src/
  app.controller.ts       # Rota inicial da aplicação
  app.module.ts            # Módulo principal
  main.ts                  # Bootstrap, porta e validação global
  auth/                    # Registro, login e proteção JWT
    dto/                   # Objetos de entrada validados
    jwt-strategy/          # Estratégia Passport JWT
  prisma/                  # Contrato e cliente MongoDB tipado
    contract.prisma
    contract.json
    contract.d.ts
test/                      # Testes end-to-end
```

## Comandos úteis

```bash
# Desenvolvimento com recarregamento automático
npm run start:dev

# Execução normal
npm run start

# Compilação
npm run build

# Execução do build
npm run start:prod

# Testes unitários
npm test

# Testes em modo watch
npm run test:watch

# Testes end-to-end
npm run test:e2e

# Cobertura de testes
npm run test:cov

# Lint
npm run lint

# Formatação
npm run format
```

## Fluxo de trabalho

Atualize sua branch local:

```bash
git pull
```

Crie uma branch para a alteração:

```bash
git checkout -b feature/nome-da-feature
```

Depois de implementar e testar:

```bash
git add .
git commit -m "feat: descreve a alteração"
git push -u origin feature/nome-da-feature
```

Use mensagens de commit curtas e descritivas, preferencialmente seguindo Conventional Commits (`feat`, `fix`, `test`, `docs`, `refactor` e similares). Abra um pull request para revisão antes de integrar a branch principal.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---:|---|
| `DATABASE_URL` | Sim | URL de conexão do MongoDB, com o nome do banco no caminho |
| `JWT_SECRET` | Sim | Segredo usado para assinar tokens JWT |
| `PORT` | Não | Porta HTTP da API; padrão `3000` |

O arquivo `.env` é ignorado pelo Git. Compartilhe valores de desenvolvimento por um canal seguro, nunca pelo repositório.

## Equipe

Preencha esta seção com os nomes, responsabilidades e canais oficiais da equipe do Conecta.

## Licença

Projeto privado. Consulte a equipe responsável antes de distribuir ou reutilizar o código.