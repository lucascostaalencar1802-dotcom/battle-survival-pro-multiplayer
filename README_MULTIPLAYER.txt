BATTLE SURVIVAL PRO — MULTIPLAYER ONLINE (4 JOGADORES)

O que vem no projeto:
- battle_survival_pro.html: jogo com menu multiplayer online, sala por código e partida rápida.
- server.js: servidor HTTP + WebSocket, salas e sincronização de jogadores.
- package.json: dependência e comando para iniciar.

IMPORTANTE
O multiplayer entre celulares diferentes só funciona quando estes arquivos forem publicados em um servidor online que aceite Node.js e WebSocket. Abrir o HTML diretamente como arquivo local não conecta à internet.

PUBLICAR (exemplo: Render)
1. Crie uma conta no Render e crie um repositório GitHub contendo os 3 arquivos.
2. No Render, escolha New > Web Service e conecte o repositório.
3. Build Command: npm install
4. Start Command: npm start
5. Use o plano/serviço que permita executar um servidor Node.js persistente. O Render define a variável PORT automaticamente.
6. Depois do deploy, abra a URL HTTPS gerada pelo Render no navegador de cada celular. O WebSocket será conectado automaticamente via WSS.

COMO TESTAR
- Abra a URL em dois celulares (ou duas abas/navegadores).
- Para sala: um jogador toca Multiplayer, informa o apelido e toca Criar sala. Compartilha o código; o outro digita o código e toca Entrar. O líder toca Iniciar partida quando houver pelo menos 2 jogadores.
- Para partida rápida: ambos tocam Partida rápida; o servidor agrupa de 2 a 4 jogadores após encontrar companhia.

LIMITAÇÕES DESTA PRIMEIRA VERSÃO
- Multiplayer em tempo real inicial para até 4 jogadores, com movimento, nomes, vida e tiros entre jogadores.
- Os demais modos locais (Solo, Contra Squad e Ranqueadas) continuam separados.
- A partida rápida espera jogadores reais; não cria bots para preencher vagas.
- Esta versão usa memória do servidor: se o serviço reiniciar, salas/partidas são apagadas.
- Isto é um protótipo jogável, não um sistema anti-cheat profissional. Para produção seriam necessários validação de movimento mais rigorosa, persistência/monitoramento e testes em redes diferentes.
