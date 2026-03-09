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
  INTERROGATION: 'INTERROGATORIO',
  ACCUSATION: 'ACUSACAO',
  ROUND_END: 'FIM_RODADA',
  GAME_END: 'FIM_JOGO'
};

const EVENT = {
  SPEED: 'RELAMPAGO',
  DOUBLE: 'RODADA_DUPLA',
  INVERTED: 'AGENCIAS_INVERTIDAS',
  BLACKOUT: 'BLACKOUT'
};

const ABILITY = {
  SHIELD: 'ESCUDO',
  INTERCEPT: 'INTERCEPTAR',
  SWAP: 'VIRAR_MESA'
};

const ROUND_DURATION_MS = 45_000;
const INTERROGATION_DURATION_MS = 15_000;
const ACCUSATION_DURATION_MS = 10_000;
const GAME_MAX_ROUNDS = 10;
const TARGET_SCORE = 15;
const BURN_INTERVAL = 3;
const PACT_BETRAYAL_PENALTY = 2;

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
    pact: null,
    roundEvent: null,
    roundMultiplier: 1,
    shieldedThisRound: {},
    interceptActive: {},
    interceptions: {},
    abilitiesUsed: {},
    swapUsedRound: null,
    interrogation: null,
    dossier: [],
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

function pickRoundEvent(round) {
  if (round % 3 !== 0) return null;
  const options = Object.values(EVENT);
  return options[Math.floor(Math.random() * options.length)];
}

function eventLabel(event) {
  const labels = {
    [EVENT.SPEED]: 'Rodada relâmpago — 10 segundos para decidir.',
    [EVENT.DOUBLE]: 'Rodada dupla — pontuação em dobro.',
    [EVENT.INVERTED]: 'Agências invertidas — objetivos trocados nesta rodada.',
    [EVENT.BLACKOUT]: 'Blackout — você não vê a jogada do adversário no reveal.'
  };
  return labels[event] || null;
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
  if (myMove === MOVE.SUPPORT && theirMove === MOVE.SUPPORT) return { me: 2, them: 2, mission: 'SUCESSO', text: 'Coordenação perfeita.' };
  if (myMove === MOVE.SUPPORT && theirMove === MOVE.NEUTRAL) return { me: 1, them: 0, mission: 'PARCIAL', text: 'Você carregou a missão.' };
  if (myMove === MOVE.SUPPORT && theirMove === MOVE.UNDERMINE) return { me: 0, them: 3, mission: 'FALHA', text: 'Você foi traído.' };
  if (myMove === MOVE.NEUTRAL && theirMove === MOVE.SUPPORT) return { me: 0, them: 1, mission: 'PARCIAL', text: 'Você segurou recursos, o outro assumiu.' };
  if (myMove === MOVE.NEUTRAL && theirMove === MOVE.NEUTRAL) return { me: 0, them: 0, mission: 'EMPATE', text: 'Ninguém comprometeu recursos.' };
  if (myMove === MOVE.NEUTRAL && theirMove === MOVE.UNDERMINE) return { me: 0, them: 2, mission: 'FALHA', text: 'O sabotador ganhou vantagem silenciosa.' };
  if (myMove === MOVE.UNDERMINE && theirMove === MOVE.SUPPORT) return { me: 3, them: 0, mission: 'FALHA', text: 'A sabotagem foi decisiva.' };
  if (myMove === MOVE.UNDERMINE && theirMove === MOVE.NEUTRAL) return { me: 2, them: 0, mission: 'FALHA', text: 'Você explorou a hesitação.' };
  return { me: -1, them: -1, mission: 'COLAPSO MÚTUO', text: 'Ambos sabotaram. Consequências pesadas.' };
}

function roomSnapshotFor(room, socketId) {
  const me = room.players.find((p) => p.id === socketId);
  const opp = room.players.find((p) => p.id !== socketId);
  const effectiveAgency = room.roundEvent === EVENT.INVERTED && room.agencies[socketId]
    ? (room.agencies[socketId] === AGENCY.CIPHER ? AGENCY.PHANTOM : AGENCY.CIPHER)
    : room.agencies[socketId];
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
    roundEvent: room.roundEvent,
    roundEventLabel: eventLabel(room.roundEvent),
    lockUntil: room.lockUntil,
    winner: room.winner,
    scores: room.scores,
    objective: me ? getObjective(effectiveAgency, room.round) : null,
    agency: room.agencies[socketId] || null,
    abilities: {
      used: room.abilitiesUsed[socketId] || {},
      shielded: Boolean(room.shieldedThisRound[socketId]),
      interceptedMove: room.interceptions[socketId] || null,
      interceptArmed: Boolean(room.interceptActive[socketId])
    },
    pact: room.pact,
    interrogation: room.interrogation
      ? {
          active: true,
          question: 'Você é da CIFRA?',
          interrogatorId: room.interrogation.interrogatorId,
          suspectId: room.interrogation.suspectId,
          suspectAnswer: room.interrogation.answerBySuspect || null,
          interrogatorVerdict: room.interrogation.verdictByInterrogator || null
        }
      : null,
    dossier: room.dossier,
    hasSubmittedMove: Boolean(room.moves[socketId]),
    hasAccused: room.accusations[socketId] !== undefined,
    resolution: room.lastResolution
      ? {
          missionResult: room.lastResolution.mission,
          myMove: room.lastResolution.moves[socketId],
          theirMove: room.roundEvent === EVENT.BLACKOUT ? '??? (BLACKOUT)' : room.lastResolution.moves[opp?.id],
          myRoundDelta: room.lastResolution.adjustedDelta[socketId] || 0,
          theirRoundDelta: room.lastResolution.adjustedDelta[opp?.id] || 0,
          note: room.lastResolution.notes[socketId]
        }
      : null
  };
}

function emitRoom(room) {
  room.players.forEach((p) => io.to(p.id).emit('state:update', roomSnapshotFor(room, p.id)));
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
  room.pact = null;
  room.interrogation = null;
  room.interceptions = {};
  room.interceptActive = {};
  room.shieldedThisRound = {};
  room.swapUsedRound = null;
  room.lastResolution = null;
  room.roundEvent = pickRoundEvent(room.round);
  room.roundMultiplier = room.roundEvent === EVENT.DOUBLE ? 2 : 1;
  room.missionText = room.missionOrder[(room.round - 1) % room.missionOrder.length];
  const allocationDuration = room.roundEvent === EVENT.SPEED ? 10_000 : ROUND_DURATION_MS;
  room.lockUntil = Date.now() + allocationDuration;

  room.timer = setTimeout(() => lockMovesAndResolve(room, true), allocationDuration);
  emitRoom(room);
}

function ensureRoomHasScores(room) {
  room.players.forEach((p) => {
    if (room.scores[p.id] === undefined) room.scores[p.id] = 0;
  });
}

function startAccusationPhase(room) {
  room.interrogation = null;
  room.phase = PHASE.ACCUSATION;
  room.lockUntil = Date.now() + ACCUSATION_DURATION_MS;
  room.timer = setTimeout(() => finalizeRound(room), ACCUSATION_DURATION_MS);
  emitRoom(room);
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
  let deltaP1 = o1.me * room.roundMultiplier;
  let deltaP2 = o1.them * room.roundMultiplier;

  if (room.pact?.status === 'ACEITO') {
    if (room.moves[p1.id] === MOVE.UNDERMINE && room.moves[p2.id] === MOVE.SUPPORT) deltaP1 -= PACT_BETRAYAL_PENALTY;
    if (room.moves[p2.id] === MOVE.UNDERMINE && room.moves[p1.id] === MOVE.SUPPORT) deltaP2 -= PACT_BETRAYAL_PENALTY;
  }

  room.scores[p1.id] += deltaP1;
  room.scores[p2.id] += deltaP2;

  room.lastResolution = {
    mission: o1.mission,
    moves: { [p1.id]: room.moves[p1.id], [p2.id]: room.moves[p2.id] },
    adjustedDelta: { [p1.id]: deltaP1, [p2.id]: deltaP2 },
    notes: {
      [p1.id]: `${o1.text}${room.pact?.status === 'ACEITO' ? ' Pacto ativo nesta rodada.' : ''}${timedOut ? ' Tempo esgotado; jogadas faltantes viraram Neutro.' : ''}`,
      [p2.id]: `${o1.text}${room.pact?.status === 'ACEITO' ? ' Pacto ativo nesta rodada.' : ''}${timedOut ? ' Tempo esgotado; jogadas faltantes viraram Neutro.' : ''}`
    }
  };

  const betrayedId = room.pact?.status === 'ACEITO'
    ? (room.moves[p1.id] === MOVE.UNDERMINE && room.moves[p2.id] === MOVE.SUPPORT ? p1.id
      : room.moves[p2.id] === MOVE.UNDERMINE && room.moves[p1.id] === MOVE.SUPPORT ? p2.id : null)
    : null;

  room.dossier.push({
    round: room.round,
    mission: room.missionText,
    pact: room.pact,
    event: room.roundEvent,
    moves: { [p1.id]: room.moves[p1.id], [p2.id]: room.moves[p2.id] },
    betrayal: betrayedId
  });

  const canInterrogate = room.players.some((p) => {
    const oppId = opponentId(room, p.id);
    return room.moves[oppId] === MOVE.UNDERMINE && room.moves[p.id] !== MOVE.UNDERMINE;
  });

  if (canInterrogate) {
    room.phase = PHASE.INTERROGATION;
    room.lockUntil = Date.now() + INTERROGATION_DURATION_MS;
    room.timer = setTimeout(() => startAccusationPhase(room), INTERROGATION_DURATION_MS);
    emitRoom(room);
    return;
  }

  startAccusationPhase(room);
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

function tryFinishInterrogation(room) {
  if (!room.interrogation?.answerBySuspect || !room.interrogation?.verdictByInterrogator) return;
  const truthful = room.agencies[room.interrogation.suspectId] === AGENCY.CIPHER ? 'SIM' : 'NAO';
  const isCorrect = room.interrogation.verdictByInterrogator === 'VERDADE'
    ? room.interrogation.answerBySuspect === truthful
    : room.interrogation.answerBySuspect !== truthful;
  if (isCorrect) room.scores[room.interrogation.interrogatorId] += 1;
  clearTimer(room);
  startAccusationPhase(room);
}

function finalizeRound(room) {
  clearTimer(room);
  if (![PHASE.ACCUSATION, PHASE.REVEAL, PHASE.INTERROGATION].includes(room.phase)) return;

  room.phase = PHASE.ROUND_END;

  room.players.forEach((p) => {
    if (room.accusations[p.id] && room.accusations[p.id].done !== true) {
      const targetId = opponentId(room, p.id);
      if (!room.shieldedThisRound[targetId]) applyAccusation(room, p.id, room.accusations[p.id].guessAgency);
      room.accusations[p.id].done = true;
    }
  });

  const [a, b] = room.players;
  const someoneWon = room.scores[a.id] >= TARGET_SCORE || room.scores[b.id] >= TARGET_SCORE;
  const hitRoundCap = room.round >= GAME_MAX_ROUNDS;

  if (someoneWon || hitRoundCap) {
    room.phase = PHASE.GAME_END;
    room.winner = room.scores[a.id] === room.scores[b.id] ? null : (room.scores[a.id] > room.scores[b.id] ? a.id : b.id);
    emitRoom(room);
    return;
  }

  if (room.round % BURN_INTERVAL === 0) assignAgencies(room);
  emitRoom(room);
  room.timer = setTimeout(() => beginRound(room), 3500);
}

io.on('connection', (socket) => {
  socket.on('room:create', ({ name }) => {
    const roomId = makeId();
    const room = createRoom(roomId);
    rooms.set(roomId, room);
    const player = { id: socket.id, name: (name || 'Agente 1').slice(0, 24) };
    room.players.push(player);
    room.scores[socket.id] = 0;
    room.abilitiesUsed[socket.id] = {};
    socket.join(roomId);
    socket.data.roomId = roomId;
    emitRoom(room);
  });

  socket.on('room:join', ({ roomId, name }) => {
    const room = rooms.get((roomId || '').toUpperCase());
    if (!room) return socket.emit('toast', 'Sala não encontrada.');
    if (room.players.length >= 2) return socket.emit('toast', 'A sala está cheia.');

    const player = { id: socket.id, name: (name || 'Agente 2').slice(0, 24) };
    room.players.push(player);
    room.scores[socket.id] = 0;
    room.abilitiesUsed[socket.id] = {};
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    emitRoom(room);
  });

  socket.on('game:start', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.LOBBY || room.players.length !== 2) return;
    assignAgencies(room);
    room.players.forEach((p) => { room.abilitiesUsed[p.id] = {}; });
    beginRound(room);
  });

  socket.on('pact:propose', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ALLOCATION || room.pact) return;
    room.pact = { proposerId: socket.id, status: 'PENDENTE' };
    emitRoom(room);
  });

  socket.on('pact:respond', ({ accept }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ALLOCATION || !room.pact || room.pact.status !== 'PENDENTE') return;
    if (room.pact.proposerId === socket.id) return;
    room.pact.status = accept ? 'ACEITO' : 'IGNORADO';
    room.pact.responderId = socket.id;
    emitRoom(room);
  });

  socket.on('move:submit', ({ move }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ALLOCATION) return;
    if (!Object.values(MOVE).includes(move)) return;

    room.moves[socket.id] = move;
    const rivalId = opponentId(room, socket.id);
    if (room.interceptActive[rivalId] && !room.moves[rivalId]) {
      room.interceptions[rivalId] = move;
      room.interceptActive[rivalId] = false;
      io.to(rivalId).emit('toast', `Interceptar ativo: oponente escolheu ${move}.`);
    }
    emitRoom(room);

    if (room.players.every((p) => room.moves[p.id])) lockMovesAndResolve(room, false);
  });

  socket.on('interrogation:start', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.INTERROGATION || room.interrogation) return;
    const suspectId = opponentId(room, socket.id);
    if (!suspectId || !(room.moves[suspectId] === MOVE.UNDERMINE && room.moves[socket.id] !== MOVE.UNDERMINE)) return;
    room.interrogation = { interrogatorId: socket.id, suspectId, answerBySuspect: null, verdictByInterrogator: null };
    emitRoom(room);
  });

  socket.on('interrogation:answer', ({ answer }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.INTERROGATION || !room.interrogation) return;
    if (room.interrogation.suspectId !== socket.id || !['SIM', 'NAO'].includes(answer)) return;
    room.interrogation.answerBySuspect = answer;
    emitRoom(room);
    tryFinishInterrogation(room);
  });

  socket.on('interrogation:judge', ({ verdict }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.INTERROGATION || !room.interrogation) return;
    if (room.interrogation.interrogatorId !== socket.id || !['MENTINDO', 'VERDADE'].includes(verdict)) return;
    room.interrogation.verdictByInterrogator = verdict;
    emitRoom(room);
    tryFinishInterrogation(room);
  });

  socket.on('ability:use', ({ ability }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    room.abilitiesUsed[socket.id] = room.abilitiesUsed[socket.id] || {};
    if (room.abilitiesUsed[socket.id][ability]) return;

    if (ability === ABILITY.SHIELD && room.phase === PHASE.ACCUSATION) {
      room.shieldedThisRound[socket.id] = true;
      room.abilitiesUsed[socket.id][ability] = true;
    }

    if (ability === ABILITY.INTERCEPT && room.phase === PHASE.ALLOCATION && !room.moves[socket.id]) {
      room.interceptActive[socket.id] = true;
      room.abilitiesUsed[socket.id][ability] = true;
      const oppId = opponentId(room, socket.id);
      if (room.moves[oppId]) {
        room.interceptions[socket.id] = room.moves[oppId];
        room.interceptActive[socket.id] = false;
      }
    }

    if (ability === ABILITY.SWAP && room.phase === PHASE.ACCUSATION && room.lastResolution && room.swapUsedRound !== room.round) {
      const oppId = opponentId(room, socket.id);
      const myDelta = room.lastResolution.adjustedDelta[socket.id] || 0;
      const oppDelta = room.lastResolution.adjustedDelta[oppId] || 0;
      room.scores[socket.id] += oppDelta - myDelta;
      room.scores[oppId] += myDelta - oppDelta;
      room.lastResolution.adjustedDelta[socket.id] = oppDelta;
      room.lastResolution.adjustedDelta[oppId] = myDelta;
      room.swapUsedRound = room.round;
      room.abilitiesUsed[socket.id][ability] = true;
    }

    emitRoom(room);
  });

  socket.on('accuse:submit', ({ agencyGuess }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ACCUSATION) return;
    if (![AGENCY.CIPHER, AGENCY.PHANTOM].includes(agencyGuess) || room.accusations[socket.id]) return;
    room.accusations[socket.id] = { guessAgency: agencyGuess, done: false };
    emitRoom(room);
  });

  socket.on('accuse:skip', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.phase !== PHASE.ACCUSATION || room.accusations[socket.id]) return;
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
    room.pact = null;
    room.roundEvent = null;
    room.roundMultiplier = 1;
    room.shieldedThisRound = {};
    room.interceptActive = {};
    room.interceptions = {};
    room.abilitiesUsed = Object.fromEntries(room.players.map((p) => [p.id, {}]));
    room.swapUsedRound = null;
    room.interrogation = null;
    room.dossier = [];
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
    delete room.abilitiesUsed[socket.id];

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
