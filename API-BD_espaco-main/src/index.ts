import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg'; // Importa o pg que acabamos de instalar

// --- INÍCIO DO CÓDIGO DE TESTE DE CONEXÃO ---

// Função de teste assíncrona
async function testDbConnection() {
  console.log("Iniciando teste de conexão direta com o banco de dados...");
  
  // Pega a URL do ambiente, a mesma que o Prisma tenta usar
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("ERRO FATAL: Variável DATABASE_URL não encontrada!");
    return;
  }
  
  console.log("Tentando conectar com a URL:", connectionString.replace(/:[^:]*@/, ':********@')); // Imprime a URL sem a senha

  // Cria um novo cliente de banco de dados
  const client = new pg.Client({ connectionString });

  try {
    // Tenta conectar
    await client.connect();
    // Se chegar aqui, a conexão foi bem-sucedida
    console.log("✅ ✅ ✅ SUCESSO! A CONEXÃO COM O BANCO DE DADOS FOI ESTABELECIDA! ✅ ✅ ✅");
  } catch (err) {
    // Se der erro, a conexão falhou
    console.error("❌ ❌ ❌ FALHA! NÃO FOI POSSÍVEL CONECTAR AO BANCO DE DADOS. ❌ ❌ ❌");
    console.error("Erro detalhado:", err);
  } finally {
    // Garante que a conexão seja fechada
    await client.end();
    console.log("Teste de conexão finalizado.");
  }
}

// --- FIM DO CÓDIGO DE TESTE DE CONEXÃO ---


const app = express();
app.use(cors());
app.use(express.json());

// Rota de health check para manter o servidor simples
app.get('/health', (_, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 4000);

// Roda o teste ANTES de iniciar o servidor
testDbConnection().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`API de teste rodando em :${port}`);
  });
});