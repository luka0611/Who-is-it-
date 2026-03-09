# Double Agent

Um jogo de blefe de espionagem para 2 jogadores, feito com Node.js + Socket.IO e pensado para web mobile (ótimo para rodar no Termux).

## Recursos

- Fluxo de sala para 2 jogadores (criar/entrar)
- Agências secretas (`CIFRA` / `FANTASMA`)
- Mecânica de Burn: embaralha as agências a cada 3 rodadas
- 40 cartas de missão em português para alta variação
- Alocação simultânea de jogadas (`APOIAR`, `NEUTRO`, `SABOTAR`)
- Pontuação pela matriz de resultado
- Janela de acusação com tempo
- Vitória ao chegar em 15 pontos ou maior pontuação após 10 rodadas
- UI limpa e mobile-first

## Executar

```bash
npm install
npm start
```

Abra `http://<ip-do-dispositivo>:3000` nos dois celulares.

## Setup rápido no Termux

```bash
pkg update
pkg install nodejs
npm install
npm start
```

Com os dois Android na mesma rede Wi-Fi, acesse:

`http://<ip-local-do-celular-com-termux>:3000`
