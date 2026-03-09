const socket = io();
const app = document.getElementById('app');

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

setInterval(() => {
  if (state.snapshot?.lockUntil) render();
}, 250);

function createRoom() {
  const name = state.selfName.trim() || 'Agente';
  localStorage.setItem('double-agent-name', name);
  socket.emit('room:create', { name });
}

function joinRoom() {
  const name = state.selfName.trim() || 'Agente';
  const roomId = state.roomCodeInput.trim().toUpperCase();
  if (!roomId) return;
  localStorage.setItem('double-agent-name', name);
  socket.emit('room:join', { roomId, name });
}

const startGame = () => socket.emit('game:start');
const restart = () => socket.emit('game:restart');
const submitMove = (move) => socket.emit('move:submit', { move });
const accuse = (agency) => socket.emit('accuse:submit', { agencyGuess: agency });
const skipAccuse = () => socket.emit('accuse:skip');

function scoreCard(player, score) {
  if (!player) return '';
  return `<div class="score-item"><div class="name">${player.name}</div><div class="pts">${score ?? 0}</div></div>`;
}

function button(text, cls, action, disabled = false) {
  return `<button class="${cls || ''}" ${disabled ? 'disabled' : ''} data-action="${action}">${text}</button>`;
}

function renderLobby(s) {
  const canStart = s.players.length === 2;
  return `
    <div class="card">
      <div class="hero"><div>
        <div class="title">Duelo de espionagem para 2 jogadores</div>
        <div class="brand">DOUBLE AGENT</div>
      </div>
      ${s.roomId ? `<div class="room">SALA ${s.roomId}</div>` : ''}
      </div>
      <p class="muted">Agências secretas. Missões compartilhadas. Traição pessoal.</p>
    </div>

    <div class="card grid">
      <input id="nameInput" value="${state.selfName}" placeholder="Seu codinome" maxlength="24" />
      ${!s.roomId ? `
        ${button('Criar sala', '', 'create')}
        <input id="roomCodeInput" value="${state.roomCodeInput}" placeholder="Código da sala" maxlength="5" />
        ${button('Entrar na sala', 'secondary', 'join')}
      ` : `${button(canStart ? 'Iniciar operação' : 'Aguardando 2º jogador…', 'pink', 'start', !canStart)}`}
    </div>

    ${s.players.length ? `<div class="card"><div class="title">Agentes na sala</div><div class="score-list" style="margin-top:.6rem;">${s.players.map((p) => `<div class="score-item"><div class="name">${p.name}</div><div class="pts">•</div></div>`).join('')}</div></div>` : ''}
  `;
}

function renderGame(s) {
  const leftMs = msRemaining(s.lockUntil);
  const total = s.phase === 'ALOCACAO' ? 45000 : 10000;
  const pct = Math.round((leftMs / total) * 100);
  const canMove = s.phase === 'ALOCACAO' && !s.hasSubmittedMove;
  const canAccuse = s.phase === 'ACUSACAO' && !s.hasAccused;

  return `
    <div class="card">
      <div class="hero">
        <div>
          <div class="title">Missão ${String(s.round).padStart(2, '0')} · Burn ${s.roundInBurnCycle}/3</div>
          <div class="brand">${s.missionText || 'Aguardando missão...'}</div>
        </div>
        <div class="badge">AGÊNCIA ${s.agency || '???'}</div>
      </div>
      <p class="muted">Objetivo privado desta rodada: <strong>${s.objective || 'Desconhecido'}</strong></p>
      <div class="timer"><span style="width:${pct}%;"></span></div>
      <div class="muted">${(leftMs / 1000).toFixed(1)}s restantes · Fase: ${s.phase}</div>
    </div>

    <div class="layout">
      <div>
        <div class="card">
          <div class="title">Alocação</div>
          <div class="moves" style="margin-top:.7rem;">
            ${button('🤝 Apoiar', '', 'move:APOIAR', !canMove)}
            ${button('🫥 Neutro', 'secondary', 'move:NEUTRO', !canMove)}
            ${button('😈 Sabotar', 'danger', 'move:SABOTAR', !canMove)}
          </div>
          <p class="muted" style="margin-top:.7rem;">${s.hasSubmittedMove ? 'Jogada travada. Aguardando oponente…' : 'Escolha uma jogada antes do tempo acabar.'}</p>
        </div>

        <div class="card">
          <div class="title">Janela de acusação</div>
          <p class="muted" style="margin:.4rem 0 .7rem;">Após a revelação, acuse a agência do parceiro para ganhar/perder pontos.</p>
          <div class="moves">
            ${button('Acusar CIFRA', 'pink', 'accuse:CIFRA', !canAccuse)}
            ${button('Acusar FANTASMA', 'secondary', 'accuse:FANTASMA', !canAccuse)}
            ${button('Não acusar', '', 'accuse:skip', !canAccuse)}
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="title">Placar</div>
          <div class="score-list" style="margin-top:.7rem;">
            ${scoreCard(s.me, s.scores[s.me?.id])}
            ${scoreCard(s.opponent, s.scores[s.opponent?.id])}
          </div>
        </div>

        <div class="card">
          <div class="title">Última revelação</div>
          ${s.resolution ? `
            <p style="margin-top:.5rem;"><strong>${s.resolution.missionResult}</strong></p>
            <p class="muted">Você: ${s.resolution.myMove} · Oponente: ${s.resolution.theirMove}</p>
            <p style="margin-top:.4rem;" class="${s.resolution.myRoundDelta >= 0 ? 'delta-plus' : 'delta-minus'}">Variação da rodada: ${s.resolution.myRoundDelta >= 0 ? '+' : ''}${s.resolution.myRoundDelta}</p>
            <p class="muted" style="margin-top:.3rem;">${s.resolution.note}</p>
          ` : `<p class="muted" style="margin-top:.5rem;">Ainda sem revelação.</p>`}
          ${s.burnIncoming ? '<p class="winner" style="margin-top:.6rem;">Burn concluído: agências serão embaralhadas na próxima rodada.</p>' : ''}
        </div>
      </div>
    </div>
  `;
}

function renderEnd(s) {
  const winnerName = s.winner ? s.players.find((p) => p.id === s.winner)?.name : null;
  return `
    <div class="card">
      <div class="title">Operação finalizada</div>
      <div class="brand" style="margin-top:.4rem;">${winnerName ? `${winnerName} venceu` : 'Empate'}</div>
      <p class="muted" style="margin-top:.5rem;">Vence quem chegar a 15 pontos ou liderar após 10 rodadas.</p>
    </div>

    <div class="card">
      <div class="title">Pontuação final</div>
      <div class="score-list" style="margin-top:.7rem;">
        ${scoreCard(s.me, s.scores[s.me?.id])}
        ${scoreCard(s.opponent, s.scores[s.opponent?.id])}
      </div>
      <div style="margin-top:.8rem;">${button('Jogar novamente', 'pink', 'restart')}</div>
    </div>
  `;
}

function render() {
  const s = state.snapshot;
  if (!s) {
    app.innerHTML = `
      <div class="card"><div class="title">Bem-vindo</div><div class="brand" style="margin-top:.4rem;">DOUBLE AGENT</div><p class="muted" style="margin-top:.6rem;">Crie ou entre em uma sala para começar.</p></div>
      <div class="card grid">
        <input id="nameInput" value="${state.selfName}" placeholder="Seu codinome" maxlength="24" />
        ${button('Criar sala', '', 'create')}
        <input id="roomCodeInput" value="${state.roomCodeInput}" placeholder="Código da sala" maxlength="5" />
        ${button('Entrar na sala', 'secondary', 'join')}
      </div>
      ${state.toast ? `<div class="card"><p>${state.toast}</p></div>` : ''}
    `;
    bind();
    return;
  }

  app.innerHTML = `
    ${s.phase === 'SALA' ? renderLobby(s) : ''}
    ${['ALOCACAO', 'REVELACAO', 'ACUSACAO', 'FIM_RODADA'].includes(s.phase) ? renderGame(s) : ''}
    ${s.phase === 'FIM_JOGO' ? renderEnd(s) : ''}
    ${state.toast ? `<div class="card"><p>${state.toast}</p></div>` : ''}
  `;
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
    };
  });
}

render();
