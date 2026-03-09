const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const AGENCY = {
  CIPHER: 'CIFRA',
  PHANTOM: 'FANTASMA'
};

const MOVE = {
  SUPPORT: 'APOIAR',
  NEUTRAL: 'NEUTRO',
  UNDERMINE: 'SABOTAR'
};

const PHASE = {
  LOBBY: 'SALA',
  ALLOCATION: 'ALOCACAO',
  REVEAL: 'REVELACAO',
  ACCUSATION: 'ACUSACAO',
  ROUND_END: 'FIM_RODADA',
  GAME_END: 'FIM_JOGO'
};

const ROUND_DURATION_MS = 45_000;
const ACCUSATION_DURATION_MS = 10_000;
const GAME_MAX_ROUNDS = 10;
const TARGET_SCORE = 15;
const BURN_INTERVAL = 3;

const missionDeck = [
  'Extrair o informante de uma estação lotada',
  'Interceptar uma transmissão codificada de satélite',
  'Instalar uma escuta no salão da embaixada',
  'Trocar a maleta no portão 4 do terminal',
  'Escoltar um agente duplo pelo mercado noturno',
  'Apagar registros de vigilância antes do amanhecer',
  'Recuperar chip protótipo no leilão clandestino',
  'Desativar o radar do porto por 90 segundos',
  'Garantir a zona de pouso no telhado',
  'Seguir o mensageiro sem ser notado',
  'Substituir passaportes falsos no esconderijo',
  'Mapear túneis sob o distrito antigo',
  'Causar apagão no centro financeiro',
  'Decodificar coordenadas de ponto morto à luz da lua',
  'Capturar amostra biométrica do alvo',
  'Segurar o bloqueio da ponte até a extração',
  'Interferir nas frequências da central policial',
  'Recuperar antídoto de um comboio',
  'Vazar informação falsa para rivais',
  'Evacuar um ativo pelo esgoto',
  'Roubar o livro-caixa do cofre do cassino',
  'Destruir matrizes de moeda falsificada',
  'Vigiar o comboio ministerial sem levantar suspeitas',
  'Contrabandear um dispositivo de escuta para um baile',
  'Sabotar a calibração de um enxame de drones',
  'Resgatar um infiltrado de um cargueiro offshore',
  'Forjar manifestos alfandegários antes da inspeção',
  'Tomar controle da torre de emergência',
  'Extrair arquivos de chantagem do arquivo central',
  'Desviar rota de carro-forte com alerta falso',
  'Interceptar mensagens de pager criptografadas',
  'Manipular relés de energia da embaixada',
  'Recuperar cartão-chave escondido na ópera',
  'Burlar checkpoint de reconhecimento facial',
  'Infiltrar laboratório durante lockdown',
  'Trocar frasco de antídoto por um decoy',
  'Coordenar entrega no telhado durante tempestade',
  'Capturar denunciante antes do amanhecer',
  'Roubar códigos de lançamento do bunker de comando',
  'Garantir transferência de testemunha no metrô antigo'
];

function createRoom(roomId) {
  return {
    roomId,
    players: [],
    phase: PHASE.LOBBY,
    round: 0,
    scores: {},
    accusations: {},
    moves: {},
    agencies: {},
    roleGuesses: {},
    missionOrder: shuffle([...missionDeck]),
    missionText: null,
    lastResolution: null,
    timer: null,
    lockUntil: null,
    winner: null
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const rooms = new Map();

function makeId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function opponentId(room, id) {
  return room.players.find((p) => p.id !== id)?.id;
}

function publicPlayer(player) {
  return { id: player.id, name: player.name };
}

function getObjective(agency, round) {
  const odd = round % 2 === 1;
  if (agency === AGENCY.CIPHER) return odd ? 'FAÇA FALHAR' : 'FAÇA DAR CERTO';
  return odd ? 'FAÇA DAR CERTO' : 'FAÇA FALHAR';
}

function assignAgencies(room) {
  const pair = Math.random() > 0.5
    ? [AGENCY.CIPHER, AGENCY.PHANTOM]
    : [AGENCY.PHANTOM, AGENCY.CIPHER];
  room.players.forEach((p, idx) => {
    room.agencies[p.id] = pair[idx];
  });
}

function getOutcome(myMove, theirMove) {
  if (myMove === MOVE.SUPPORT && theirMove === MOVE.SUPPORT) {
    return { me: 2, them: 2, mission: 'SUCESSO', text: 'Coordenação perfeita.' };
  }
  if (myMove === MOVE.SUPPORT && theirMove === MOVE.NEUTRAL) {
    return { me: 1, them: 0, mission: 'PARCIAL', text: 'Você carregou a missão.' };
  }
  if (myMove === MOVE.SUPPORT && theirMove === MOVE.UNDERMINE) {
    return { me: 0, them: 3, mission: 'FALHA', text: 'Você foi traído.' };
  }
  if (myMove === MOVE.NEUTRAL && theirMove === MOVE.SUPPORT) {
    return { me: 0, them: 1, mission: 'PARCIAL', text: 'Você segurou recursos, o outro assumiu.' };
  }
  if (myMove === MOVE.NEUTRAL && theirMove === MOVE.NEUTRAL) {
    return { me: 0, them: 0, mission: 'EMPATE', text: 'Ninguém comprometeu recursos.' };
  }
  if (myMove === MOVE.NEUTRAL && theirMove === MOVE.UNDERMINE) {
    return { me: 0, them: 2, mission: 'FALHA', text: 'O sabotador ganhou vantagem silenciosa.' };
  }
  if (myMove === MOVE.UNDERMINE && theirMove === MOVE.SUPPORT) {
    return { me: 3, them: 0, mission: 'FALHA', text: 'A sabotagem foi decisiva.' };
  }
  if (myMove === MOVE.UNDERMINE && theirMove === MOVE.NEUTRAL) {
    return { me: 2, them: 0, mission: 'FALHA', text: 'Você explorou a hesitação.' };
  }
  return { me: -1, them: -1, mission: 'COLAPSO MÚTUO', text: 'Ambos sabotaram. Consequências pesadas.' };
}

function roomSnapshotFor(room, socketId) {
  const me = room.players.find((p) => p.id === socketId);
  const opp = room.players.find((p) => p.id !== socketId);
  return {
    roomId: room.roomId,
    phase: room.phase,
    round: room.round,
    roundInBurnCycle: ((room.round - 1) % BURN_INTERVAL) + 1,
    burnIncoming: room.round > 0 && room.round % BURN_INTERVAL === 0,
    players: room.players.map(publicPlayer),
    me: me ? publicPlayer(me) : null,
    opponent: opp ? publicPlayer(opp) : null,
    missionText: room.missionText,
    lockUntil: room.lockUntil,
    winner: room.winner,
    scores: room.scores,
    objective: me ? getObjective(room.agencies[socketId], room.round) : null,
    agency: room.agencies[socketId] || null,
    hasSubmittedMove: Boolean(room.moves[socketId]),
    hasAccused: room.accusations[socketId] !== undefined,
    resolution: room.lastResolution
      ? {
          missionResult: room.lastResolution.mission,
          myMove: room.lastResolution.moves[socketId],
          theirMove: room.lastResolution.moves[opp?.id],
          myRoundDelta: room.lastResolution.delta[socketId] || 0,
          theirRoundDelta: room.lastResolution.delta[opp?.id] || 0,
          note: room.lastResolution.notes[socketId]
        }
      : null
  };
}

function emitRoom(room) {
  room.players.forEach((p) => {
    io.to(p.id).emit('state:update', roomSnapshotFor(room, p.id));
  });
}

function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function beginRound(room) {
  clearTimer(room);
  room.round += 1;
  room.phase = PHASE.ALLOCATION;
  room.moves = {};
  room.accusations = {};
  room.roleGuesses = {};
  room.lastResolution = null;
  room.missionText = room.missionOrder[(room.round - 1) % room.missionOrder.length];
  room.lockUntil = Date.now() + ROUND_DURATION_MS;

  room.timer = setTimeout(() => {
    lockMovesAndResolve(room, true);
  }, ROUND_DURATION_MS);

  emitRoom(room);
}

function ensureRoomHasScores(room) {
  room.players.forEach((p) => {
    if (room.scores[p.id] === undefined) room.scores[p.id] = 0;
  });
}

function lockMovesAndResolve(room, timedOut = false) {
  if (room.phase !== PHASE.ALLOCATION) return;
  clearTimer(room);
  room.phase = PHASE.REVEAL;

  ensureRoomHasScores(room);

  room.players.forEach((p) => {
    if (!room.moves[p.id]) room.moves[p.id] = MOVE.NEUTRAL;
  });

  const [p1, p2] = room.players;
  const o1 = getOutcome(room.moves[p1.id], room.moves[p2.id]);

  room.scores[p1.id] += o1.me;
  room.scores[p2.id] += o1.them;

  const notes = {
    [p1.id]: `${o1.text}${timedOut ? ' Tempo esgotado; jogadas faltantes viraram Neutro.' : ''}`,
    [p2.id]: `${o1.text}${timedOut ? ' Tempo esgotado; jogadas faltantes viraram Neutro.' : ''}`
  };

  room.lastResolution = {
    mission: o1.mission,
    moves: {
      [p1.id]: room.moves[p1.id],
      [p2.id]: room.moves[p2.id]
    },
    delta: {
      [p1.id]: o1.me,
      [p2.id]: o1.them
    },
    notes
  };

  room.phase = PHASE.ACCUSATION;
  room.lockUntil = Date.now() + ACCUSATION_DURATION_MS;
  room.timer = setTimeout(() => {
    finalizeRound(room);
  }, ACCUSATION_DURATION_MS);

  emitRoom(room);
}

function applyAccusation(room, accuserId, accusedAgency) {
  const targetId = opponentId(room, accuserId);
  if (!targetId) return;

  const targetAgency = room.agencies[targetId];
  if (accusedAgency === targetAgency) {
    room.scores[accuserId] += 2;
    room.scores[targetId] -= 1;
  } else {
    room.scores[accuserId] -= 2;
    room.scores[targetId] += 1;
  }
}

function finalizeRound(room) {
  clearTimer(room);
  if (![PHASE.ACCUSATION, PHASE.REVEAL].includes(room.phase)) return;

  room.phase = PHASE.ROUND_END;

  room.players.forEach((p) => {
    if (room.accusations[p.id] && room.accusations[p.id].done !== true) {
      applyAccusation(room, p.id, room.accusations[p.id].guessAgency);
      room.accusations[p.id].done = true;
    }
  });

  const [a, b] = room.players;
  const someoneWon = room.scores[a.id] >= TARGET_SCORE || room.scores[b.id] >= TARGET_SCORE;
  const hitRoundCap = room.round >= GAME_MAX_ROUNDS;

  if (someoneWon || hitRoundCap) {
    room.phase = PHASE.GAME_END;
    if (room.scores[a.id] === room.scores[b.id]) room.winner = null;
    else room.winner = room.scores[a.id] > room.scores[b.id] ? a.id : b.id;
    emitRoom(room);
    return;
  }

  if (room.round % BURN_INTERVAL === 0) {
    assignAgencies(room);
  }

  emitRoom(room);

  room.timer = setTimeout(() => {
    beginRound(room);
  }, 3500);
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }) => {
    const roomId = makeId();
    const room = createRoom(roomId);
    rooms.set(roomId, room);

    const player = { id: socket.id, name: (name || 'Agente 1').slice(0, 24) };
    room.players.push(player);
    room.scores[socket.id] = 0;

    socket.join(roomId);
    socket.data.roomId = roomId;

    emitRoom(room);
  });

  socket.on('room:join', ({ roomId, name }) => {
    const room = rooms.get((roomId || '').toUpperCase());
    if (!room) {
      socket.emit('toast', 'Sala não encontrada.');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('toast', 'A sala está cheia.');
      return;
    }

    const player = { id: socket.id, name: (name || 'Agente 2').slice(0, 24) };
    room.players.push(player);
    room.scores[socket.id] = 0;

    socket.join(room.roomId);
    socket.data.roomId = room.roomId;

    emitRoom(room);
  });

  socket.on('game:start', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.LOBBY || room.players.length !== 2) return;
    assignAgencies(room);
    beginRound(room);
  });

  socket.on('move:submit', ({ move }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ALLOCATION) return;
    if (!Object.values(MOVE).includes(move)) return;

    room.moves[socket.id] = move;
    emitRoom(room);

    if (room.players.every((p) => room.moves[p.id])) {
      lockMovesAndResolve(room, false);
    }
  });

  socket.on('accuse:submit', ({ agencyGuess }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ACCUSATION) return;
    if (![AGENCY.CIPHER, AGENCY.PHANTOM].includes(agencyGuess)) return;
    if (room.accusations[socket.id]) return;

    room.accusations[socket.id] = {
      guessAgency: agencyGuess,
      done: false
    };

    emitRoom(room);
  });

  socket.on('accuse:skip', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ACCUSATION) return;
    if (room.accusations[socket.id]) return;

    room.accusations[socket.id] = { guessAgency: null, done: true };
    emitRoom(room);
  });

  socket.on('game:restart', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.players.length !== 2) return;

    clearTimer(room);
    room.phase = PHASE.LOBBY;
    room.round = 0;
    room.winner = null;
    room.scores = Object.fromEntries(room.players.map((p) => [p.id, 0]));
    room.moves = {};
    room.accusations = {};
    room.roleGuesses = {};
    room.agencies = {};
    room.lastResolution = null;
    room.missionOrder = shuffle([...missionDeck]);
    room.missionText = null;
    room.lockUntil = null;

    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
    delete room.scores[socket.id];
    delete room.moves[socket.id];
    delete room.accusations[socket.id];
    delete room.agencies[socket.id];

    clearTimer(room);

    if (room.players.length === 0) {
      rooms.delete(room.roomId);
    } else {
      room.phase = PHASE.LOBBY;
      room.round = 0;
      room.winner = null;
      room.lastResolution = null;
      room.lockUntil = null;
      emitRoom(room);
      io.to(room.players[0].id).emit('toast', 'O outro jogador desconectou. Aguardando na sala.');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Double Agent server running at http://localhost:${PORT}`);
});
