const socket = io();
const app = document.getElementById('app');

const ABILITY = {
  SHIELD: 'ESCUDO',
  INTERCEPT: 'INTERCEPTAR',
  SWAP: 'VIRAR_MESA'
};

const state = {
  selfName: localStorage.getItem('double-agent-name') || '',
  roomCodeInput: '',
  toast: '',
  snapshot: null
};

socket.on('toast', (msg) => {
  state.toast = msg;
  render();
  setTimeout(() => {
    state.toast = '';
    render();
  }, 2600);
});

socket.on('state:update', (snapshot) => {
  state.snapshot = snapshot;
  render();
});

function msRemaining(lockUntil) {
  if (!lockUntil) return 0;
  return Math.max(0, lockUntil - Date.now());
}
setInterval(() => state.snapshot?.lockUntil && render(), 250);

const createRoom = () => {
  const name = state.selfName.trim() || 'Agente';
  localStorage.setItem('double-agent-name', name);
  socket.emit('room:create', { name });
};
const joinRoom = () => {
  const name = state.selfName.trim() || 'Agente';
  const roomId = state.roomCodeInput.trim().toUpperCase();
  if (!roomId) return;
  localStorage.setItem('double-agent-name', name);
  socket.emit('room:join', { roomId, name });
};

const startGame = () => socket.emit('game:start');
const restart = () => socket.emit('game:restart');
const submitMove = (move) => socket.emit('move:submit', { move });
const accuse = (agency) => socket.emit('accuse:submit', { agencyGuess: agency });
const skipAccuse = () => socket.emit('accuse:skip');
const proposePact = () => socket.emit('pact:propose');
const respondPact = (accept) => socket.emit('pact:respond', { accept });
const useAbility = (ability) => socket.emit('ability:use', { ability });
const startInterrogation = () => socket.emit('interrogation:start');
const answerInterrogation = (answer) => socket.emit('interrogation:answer', { answer });
const judgeInterrogation = (verdict) => socket.emit('interrogation:judge', { verdict });

const button = (text, cls, action, disabled = false) => `<button class="${cls || ''}" ${disabled ? 'disabled' : ''} data-action="${action}">${text}</button>`;
const scoreCard = (player, score) => player ? `<div class="score-item"><div class="name">${player.name}</div><div class="pts">${score ?? 0}</div></div>` : '';

function renderLobby(s) {
  const canStart = s.players.length === 2;
  return `<div class="card"><div class="hero"><div><div class="title">Duelo de espionagem para 2 jogadores</div><div class="brand">DOUBLE AGENT</div></div>${s.roomId ? `<div class="room">SALA ${s.roomId}</div>` : ''}</div><p class="muted">Agências secretas. Missões compartilhadas. Traição pessoal.</p></div>
  <div class="card grid"><input id="nameInput" value="${state.selfName}" placeholder="Seu codinome" maxlength="24" />
  ${!s.roomId ? `${button('Criar sala', '', 'create')}<input id="roomCodeInput" value="${state.roomCodeInput}" placeholder="Código da sala" maxlength="5" />${button('Entrar na sala', 'secondary', 'join')}` : `${button(canStart ? 'Iniciar operação' : 'Aguardando 2º jogador…', 'pink', 'start', !canStart)}`}</div>`;
}

function abilityButtons(s, phase) {
  const used = s.abilities?.used || {};
  const canShield = phase === 'ACUSACAO' && !used[ABILITY.SHIELD];
  const canIntercept = phase === 'ALOCACAO' && !used[ABILITY.INTERCEPT] && !s.hasSubmittedMove;
  const canSwap = phase === 'ACUSACAO' && !used[ABILITY.SWAP] && Boolean(s.resolution);
  return `<div class="card"><div class="title">Habilidades secretas (1 uso)</div><div class="moves" style="margin-top:.7rem;">
  ${button(`🛡️ Escudo ${used[ABILITY.SHIELD] ? '✓' : ''}`, 'secondary', 'ability:ESCUDO', !canShield)}
  ${button(`👁️ Interceptar ${used[ABILITY.INTERCEPT] ? '✓' : ''}`, 'secondary', 'ability:INTERCEPTAR', !canIntercept)}
  ${button(`🔄 Virar a Mesa ${used[ABILITY.SWAP] ? '✓' : ''}`, 'secondary', 'ability:VIRAR_MESA', !canSwap)}
  </div>${s.abilities?.interceptArmed ? '<p class="muted" style="margin-top:.5rem;">Interceptar armado. Esperando o oponente decidir...</p>' : ''}${s.abilities?.interceptedMove ? `<p class="winner" style="margin-top:.5rem;">Interceptado: ${s.abilities.interceptedMove}</p>` : ''}</div>`;
}

function renderPact(s) {
  if (s.phase !== 'ALOCACAO') return '';
  const p = s.pact;
  if (!p) return `<div class="card"><div class="title">Pacto da rodada</div><p class="muted" style="margin:.4rem 0 .7rem;">Proponha um acordo público antes da alocação.</p>${button('🤝 "Vamos apoiar juntos?"', 'pink', 'pact:propose', s.hasSubmittedMove)}</div>`;
  if (p.status === 'PENDENTE' && p.proposerId !== s.me.id) return `<div class="card"><div class="title">Pacto recebido</div><p style="margin:.5rem 0;">"Vamos apoiar juntos?"</p><div class="moves">${button('Aceitar', 'pink', 'pact:accept')}${button('Ignorar', 'secondary', 'pact:ignore')}</div></div>`;
  return `<div class="card"><div class="title">Pacto da rodada</div><p class="muted" style="margin-top:.5rem;">Status: <strong>${p.status}</strong>${p.status === 'ACEITO' ? ' · traição com SABOTAR x APOIAR gera punição extra.' : ''}</p></div>`;
}

function renderInterrogation(s) {
  if (s.phase !== 'INTERROGATORIO') return '';
  const q = s.interrogation;
  const canStart = !q && s.resolution?.theirMove === 'SABOTAR';
  if (!q) return `<div class="card"><div class="title">Modo Interrogatório (15s)</div><p class="muted" style="margin:.5rem 0 .7rem;">Ative para pressionar o suspeito antes da acusação.</p>${button('🎭 Iniciar interrogatório', 'pink', 'interrogation:start', !canStart)}</div>`;
  if (q.suspectId === s.me.id) return `<div class="card"><div class="title">Interrogatório</div><p style="margin:.5rem 0;">${q.question}</p><div class="moves">${button('Sim', '', 'interrogation:answer:SIM', Boolean(q.suspectAnswer))}${button('Não', 'secondary', 'interrogation:answer:NAO', Boolean(q.suspectAnswer))}</div></div>`;
  if (q.interrogatorId === s.me.id) return `<div class="card"><div class="title">Interrogatório</div><p class="muted" style="margin:.4rem 0;">Resposta do suspeito: <strong>${q.suspectAnswer || 'Aguardando...'}</strong></p><div class="moves">${button('Está mentindo', 'danger', 'interrogation:judge:MENTINDO', !q.suspectAnswer || Boolean(q.interrogatorVerdict))}${button('Está dizendo a verdade', 'secondary', 'interrogation:judge:VERDADE', !q.suspectAnswer || Boolean(q.interrogatorVerdict))}</div></div>`;
  return '';
}

function renderGame(s) {
  const leftMs = msRemaining(s.lockUntil);
  const total = s.phase === 'ALOCACAO' ? (s.roundEvent === 'RELAMPAGO' ? 10000 : 45000) : (s.phase === 'INTERROGATORIO' ? 15000 : 10000);
  const pct = Math.round((leftMs / total) * 100);
  const canMove = s.phase === 'ALOCACAO' && !s.hasSubmittedMove;
  const canAccuse = s.phase === 'ACUSACAO' && !s.hasAccused;

  return `<div class="card"><div class="hero"><div><div class="title">Missão ${String(s.round).padStart(2, '0')} · Burn ${s.roundInBurnCycle}/3</div><div class="brand">${s.missionText || 'Aguardando missão...'}</div></div><div class="badge">AGÊNCIA ${s.agency || '???'}</div></div>
  <p class="muted">Objetivo privado: <strong>${s.objective || 'Desconhecido'}</strong></p>
  ${s.roundEventLabel ? `<p class="event-pill">⚡ ${s.roundEventLabel}</p>` : ''}
  <div class="timer"><span style="width:${pct}%;"></span></div><div class="muted">${(leftMs / 1000).toFixed(1)}s restantes · Fase: ${s.phase}</div></div>

  <div class="layout"><div>
    ${renderPact(s)}
    <div class="card"><div class="title">Alocação</div><div class="moves" style="margin-top:.7rem;">${button('🤝 Apoiar', '', 'move:APOIAR', !canMove)}${button('🫥 Neutro', 'secondary', 'move:NEUTRO', !canMove)}${button('😈 Sabotar', 'danger', 'move:SABOTAR', !canMove)}</div></div>
    ${renderInterrogation(s)}
    <div class="card"><div class="title">Janela de acusação</div><div class="moves" style="margin-top:.7rem;">${button('Acusar CIFRA', 'pink', 'accuse:CIFRA', !canAccuse)}${button('Acusar FANTASMA', 'secondary', 'accuse:FANTASMA', !canAccuse)}${button('Não acusar', '', 'accuse:skip', !canAccuse)}</div></div>
    ${abilityButtons(s, s.phase)}
  </div>
  <div>
    <div class="card"><div class="title">Placar</div><div class="score-list" style="margin-top:.7rem;">${scoreCard(s.me, s.scores[s.me?.id])}${scoreCard(s.opponent, s.scores[s.opponent?.id])}</div></div>
    <div class="card"><div class="title">Última revelação</div>${s.resolution ? `<p style="margin-top:.5rem;"><strong>${s.resolution.missionResult}</strong></p><p class="muted">Você: ${s.resolution.myMove} · Oponente: ${s.resolution.theirMove}</p><p style="margin-top:.4rem;" class="${s.resolution.myRoundDelta >= 0 ? 'delta-plus' : 'delta-minus'}">Variação da rodada: ${s.resolution.myRoundDelta >= 0 ? '+' : ''}${s.resolution.myRoundDelta}</p><p class="muted" style="margin-top:.3rem;">${s.resolution.note}</p>` : '<p class="muted" style="margin-top:.5rem;">Ainda sem revelação.</p>'}</div>
  </div></div>`;
}

function renderEnd(s) {
  const winnerName = s.winner ? s.players.find((p) => p.id === s.winner)?.name : null;
  const dossier = (s.dossier || []).map((item) => {
    const meMove = item.moves[s.me.id];
    const oppMove = item.moves[s.opponent.id];
    const betrayal = item.betrayal === s.me.id ? 'Você quebrou o pacto' : (item.betrayal === s.opponent.id ? `${s.opponent.name} quebrou o pacto` : 'Sem quebra de pacto');
    return `<div class="score-item"><div class="name">Rodada ${item.round}${item.event ? ` · ${item.event}` : ''}</div><div class="muted">Você: ${meMove} · ${s.opponent.name}: ${oppMove}</div><div class="muted">${betrayal}</div></div>`;
  }).join('');
  return `<div class="card"><div class="title">Operação finalizada</div><div class="brand" style="margin-top:.4rem;">${winnerName ? `${winnerName} venceu` : 'Empate'}</div></div>
  <div class="card"><div class="title">Dossiê final</div><div class="score-list" style="grid-template-columns:1fr; margin-top:.7rem;">${dossier || '<p class="muted">Sem histórico.</p>'}</div><div style="margin-top:.8rem;">${button('Jogar novamente', 'pink', 'restart')}</div></div>`;
}

function render() {
  const s = state.snapshot;
  if (!s) {
    app.innerHTML = `<div class="card"><div class="title">Bem-vindo</div><div class="brand" style="margin-top:.4rem;">DOUBLE AGENT</div></div><div class="card grid"><input id="nameInput" value="${state.selfName}" placeholder="Seu codinome" maxlength="24" />${button('Criar sala', '', 'create')}<input id="roomCodeInput" value="${state.roomCodeInput}" placeholder="Código da sala" maxlength="5" />${button('Entrar na sala', 'secondary', 'join')}</div>${state.toast ? `<div class="card"><p>${state.toast}</p></div>` : ''}`;
    return bind();
  }

  app.innerHTML = `${s.phase === 'SALA' ? renderLobby(s) : ''}${['ALOCACAO', 'REVELACAO', 'INTERROGATORIO', 'ACUSACAO', 'FIM_RODADA'].includes(s.phase) ? renderGame(s) : ''}${s.phase === 'FIM_JOGO' ? renderEnd(s) : ''}${state.toast ? `<div class="card"><p>${state.toast}</p></div>` : ''}`;
  bind();
}

function bind() {
  const nameInput = document.getElementById('nameInput');
  if (nameInput) nameInput.oninput = (e) => { state.selfName = e.target.value; };
  const roomCodeInput = document.getElementById('roomCodeInput');
  if (roomCodeInput) roomCodeInput.oninput = (e) => { state.roomCodeInput = e.target.value; };

  document.querySelectorAll('[data-action]').forEach((el) => {
    el.onclick = () => {
      const action = el.getAttribute('data-action');
      if (action === 'create') createRoom();
      if (action === 'join') joinRoom();
      if (action === 'start') startGame();
      if (action === 'restart') restart();
      if (action.startsWith('move:')) submitMove(action.split(':')[1]);
      if (action.startsWith('accuse:')) {
        const val = action.split(':')[1];
        if (val === 'skip') skipAccuse(); else accuse(val);
      }
      if (action === 'pact:propose') proposePact();
      if (action === 'pact:accept') respondPact(true);
      if (action === 'pact:ignore') respondPact(false);
      if (action.startsWith('ability:')) useAbility(action.split(':')[1]);
      if (action === 'interrogation:start') startInterrogation();
      if (action.startsWith('interrogation:answer:')) answerInterrogation(action.split(':')[2]);
      if (action.startsWith('interrogation:judge:')) judgeInterrogation(action.split(':')[2]);
    };
  });
}

render();
