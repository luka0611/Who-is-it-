# Double Agent

Um jogo de blefe de espionagem para 2 jogadores, feito com Node.js + Socket.IO e pensado para web mobile.

## Recursos

- Fluxo de sala para 2 jogadores (criar/entrar)
- Agências secretas (`CIFRA` / `FANTASMA`)
- Mecânica de Burn: embaralha as agências a cada 3 rodadas
- 40 cartas de missão em português para alta variação
- **Sistema de Pactos** com proposta visível para os dois jogadores e punição extra por traição após pacto aceito
- **Modo Interrogatório** de 15 segundos quando sabotagem unilateral é revelada, com bônus por leitura correta
- **Cartas de Evento** a cada 3 rodadas (relâmpago, pontuação dupla, agências invertidas, blackout)
- **Habilidades especiais** (1 uso por partida): Escudo, Interceptar e Virar a Mesa
- **Dossiê final** com histórico de rodadas, jogadas, eventos e quebra de pactos
- Janela de acusação com tempo
- Vitória ao chegar em 15 pontos ou maior pontuação após 10 rodadas

## Executar

```bash
npm install
npm start
```

Abra `http://<ip-do-dispositivo>:3000` nos dois celulares.
