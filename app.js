(function (root) {
  'use strict';

  function calculate(data, answers) {
    const chosen = data.questions.map(q => ({
      q, option: q.options.find(o => o.id === answers[q.id])
    }));
    if (chosen.some(({option}) => !option)) throw new Error('8개 문항에 모두 답해주세요.');

    const ranked = data.projects.map(project => {
      const contributions = chosen.map(({q, option}) => ({
        questionId: q.id, optionId: option.id, answer: option.text, raw: option.scores[project.id],
        points: option.scores[project.id] * q.weight, core: q.weight === 2
      }));
      return {
        ...project, contributions,
        score: contributions.reduce((sum, c) => sum + c.points, 0),
        domainScore: contributions.reduce((sum, c) => sum + (c.core ? c.points : 0), 0),
        coreCount: contributions.filter(c => c.raw === 4).length
      };
    }).sort((a, b) => b.score - a.score || b.domainScore - a.domainScore
      || b.coreCount - a.coreCount || a.id.localeCompare(b.id));
    return { ranked, role: chosen.find(({option}) => option.role).option.role };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {calculate};
  if (typeof document === 'undefined') return;

  const data = root.TEST_DATA;
  const app = document.getElementById('app');
  const state = {screen: 'intro', index: 0, answers: {}, review: false, mentorQuestions: new Map()};
  const lastMentorQuestions = new Map();
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const isLink = url => {
    try { return ['http:', 'https:'].includes(new URL(url).protocol); }
    catch { return false; }
  };
  const linkButton = (url, label, cls = '') => isLink(url)
    ? `<a class="button ${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`
    : '';

  const counterEndpoint = document.querySelector('meta[name="goatcounter"]')?.content;
  const trackedEvents = new Set();
  let counterReady;

  function loadCounter() {
    if (!counterReady) {
      counterReady = new Promise(resolve => {
        const script = document.createElement('script');
        script.src = 'https://gc.zgo.at/count.js';
        script.async = true;
        script.dataset.goatcounter = counterEndpoint;
        script.dataset.goatcounterSettings = JSON.stringify({no_onload: true});
        script.onload = () => resolve(root.goatcounter);
        script.onerror = () => resolve(null);
        document.head.append(script);
      });
    }
    return counterReady;
  }

  function trackAttempt(path, title) {
    if (!counterEndpoint || root.location.protocol !== 'https:' || trackedEvents.has(path)) return;
    trackedEvents.add(path);
    loadCounter().then(counter => counter?.count?.({path, title, event: true, no_session: true, referrer: ''}))
      .catch(() => { /* Analytics failures never interrupt the quiz. */ });
  }

  function reviewPanel(result) {
    if (!state.review) return '';
    const selections = data.questions.map(q => `${q.id}${state.answers[q.id] || '—'}`).join(' · ');
    const ranking = result ? `
      <div class="table-scroll" tabindex="0" role="region" aria-label="프로젝트별 점수"><table>
        <caption>6개 프로젝트의 순위와 문항별 가중점수</caption>
        <thead><tr><th>순위</th><th>사업</th>${data.questions.map(q => `<th>${q.id}</th>`).join('')}<th>총점</th></tr></thead>
        <tbody>${result.ranked.map((p, i) => `<tr><td>${i + 1}</td><th>${esc(p.country)}</th>
          ${p.contributions.map(c => `<td>${c.points}</td>`).join('')}<td>${p.score}</td></tr>`).join('')}</tbody>
      </table></div>
      <p>총점이 같으면 Q5~Q7 가중 합계, 4점 답변 수, 사업 ID 순으로 비교합니다.</p>` : '';
    return `<aside class="review-panel"><strong>검토 모드</strong><p>현재 선택 · ${esc(selections)}</p>${ranking}</aside>`;
  }

  function renderIntro() {
    app.innerHTML = `<section class="intro">
      <div class="intro-copy">
        <p class="eyebrow">KOICA 프로젝트 봉사단 · 10기</p>
        <h1 tabindex="-1">나의 해외봉사<br><em>캐릭터</em>는?</h1>
        <p class="lead">해외봉사 현장의 여덟 장면을 골라 보세요.<br>마음이 향하는 활동과 10기 프로젝트를 찾아봐요.</p>
        <div class="intro-meta"><span>8문항</span><span>약 2분</span><span>6개 프로젝트</span></div>
        <button id="start" class="button primary">나의 해외봉사 유형 알아보기 <span aria-hidden="true">↗</span></button>
        <p class="small-note">${esc(data.disclaimer)}</p>
      </div>
      <div class="illustration" aria-hidden="true">
        <div class="orbit"></div><div class="ticket"><span>FIELD NOTES</span><b>나의 다음 장면</b>
        <div class="ticket-stamps"><i>✳</i><i>↗</i><i>♡</i></div><small>PEOPLE · IDEAS · LITTLE CHANGES</small>
        <div class="ticket-dash"></div><div class="ticket-bottom"><span>나답게 / 함께</span><b>01 — 06</b></div></div>
        <div class="sticky">마음이 가는 곳에<br>내 역할이 있을지도!</div><span class="spark">✺</span>
      </div></section>${reviewPanel()}`;
    document.getElementById('start').onclick = () => {
      state.screen = 'quiz';
      render();
      trackAttempt('test-start', '테스트 시작');
    };
  }

  function renderQuiz() {
    const q = data.questions[state.index];
    const total = data.questions.length;
    const current = state.index + 1;
    const selected = state.answers[q.id];
    app.innerHTML = `<section class="quiz">
      <div class="quiz-top"><span class="eyebrow">SCENE ${String(current).padStart(2, '0')}</span>
        <span class="counter">${current}<span> / ${total}</span></span></div>
      <div class="progress" role="progressbar" aria-label="질문 진행" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${current}">
        <span style="width:${current / total * 100}%"></span></div>
      <h1 tabindex="-1"><span class="sr-only">${total}개 중 ${current}번째 질문. </span>${esc(q.title)}</h1>
      <p class="question-caption">지금 더 마음이 가는 장면 하나를 골라주세요.</p>
      <div class="options" role="group" aria-label="답변 하나 선택">${q.options.map(o => `
        <button class="option ${selected === o.id ? 'selected' : ''}" data-answer="${o.id}" aria-pressed="${selected === o.id}">
          <span class="option-key" aria-hidden="true">${o.id}</span><span>${esc(o.text)}</span>
          <span class="option-check" aria-hidden="true">${selected === o.id ? '✓' : '↗'}</span></button>`).join('')}</div>
      <div class="question-nav">
        <button id="back" class="text-button">← ${current === 1 ? '처음으로' : '이전 질문'}</button>
        ${selected ? `<button id="next" class="button secondary">${current === total ? '내 결과 보기' : '다음 질문'} →</button>` : ''}
      </div></section>${reviewPanel()}`;

    const advance = () => {
      if (current === total) state.screen = 'result';
      else state.index++;
      render();
    };
    app.querySelectorAll('[data-answer]').forEach(button => {
      button.onclick = () => {
        state.answers[q.id] = button.dataset.answer;
        advance();
      };
    });
    document.getElementById('back').onclick = () => {
      if (state.index > 0) state.index--;
      else state.screen = 'intro';
      render();
    };
    const next = document.getElementById('next');
    if (next) next.onclick = advance;
  }

  function renderEvidence(project, limit) {
    const evidence = project.contributions.filter(c => c.raw >= 3)
      .map(c => ({...c, explanation: project.reasons?.[c.questionId + c.optionId]}))
      .filter(c => c.explanation)
      .sort((a, b) => b.points - a.points || b.raw - a.raw || a.questionId.localeCompare(b.questionId))
      .filter((c, index, all) => all.findIndex(other => other.explanation === c.explanation) === index)
      .slice(0, limit);
    if (!evidence.length) return '';
    return `<ul class="evidence-list">${evidence.map(c => `<li>
      <strong class="evidence-answer">${esc(c.answer)}</strong>
      <p class="evidence-explanation">${esc(c.explanation)}</p>
    </li>`).join('')}</ul>`;
  }

  function projectTitle(p) {
    return `${p.country} ${p.title}`;
  }

  function mentorQuestionFor(project) {
    if (!state.mentorQuestions.has(project.id)) {
      const questions = project.mentorQuestions;
      const fresh = questions.filter(question => question !== lastMentorQuestions.get(project.id));
      const candidates = fresh.length ? fresh : questions;
      const question = candidates[Math.floor(Math.random() * candidates.length)];
      state.mentorQuestions.set(project.id, question);
      lastMentorQuestions.set(project.id, question);
    }
    return state.mentorQuestions.get(project.id);
  }

  function renderResult() {
    const result = calculate(data, state.answers);
    const [primary, alternate] = result.ranked;
    const {character} = primary;
    const role = data.roles[result.role];
    const {noticeUrl, previewUrl, schedule} = data.recruitment;
    const official = isLink(noticeUrl);
    const recruitmentLink = linkButton(official ? noticeUrl : previewUrl,
      'KOICA 모집 안내 보기', 'primary');
    const mentoringLink = linkButton(data.mentoringUrl, '비밀과외 신청', 'secondary')
      || '<button class="button secondary unavailable" disabled>비밀과외 신청 · 준비 중</button>';

    app.innerHTML = `<section class="result">
      <header class="result-hero" style="--character-accent:${esc(primary.accent)}">
        <p class="eyebrow">나의 해외봉사 캐릭터</p>
        <span class="character-emoji" aria-hidden="true">${esc(character.emoji)}</span>
        <h1 tabindex="-1">${esc(character.name)}</h1>
        <p class="type-line">${esc(character.line)}</p>
        <span class="result-badge">${esc(role.name)}</span>
        <p class="role-description">${esc(role.description)}</p>
        <p class="main-match"><span aria-hidden="true">${esc(primary.flag)}</span> ${esc(projectTitle(primary))}</p>
      </header>
      <section class="result-section">
        <h2>왜 이 프로젝트가 나왔을까요?</h2>
        ${renderEvidence(primary, 2) || `<p>${esc(primary.summary)}</p>`}
      </section>
      <section class="result-section">
        <h2>10기 프로젝트 알아보기</h2>
        <h3 class="project-name">${esc(projectTitle(primary))}</h3>
        <p>${esc(primary.summary)}</p>
        <div class="skill-tags">${primary.roles.map(r => `<span>${esc(r)}</span>`).join('')}</div>
        <p class="recruitment-note">지원서 접수 · ${esc(schedule)}</p>
      </section>
      <section class="result-section alternate">
        <h2>또 다른 관심 프로젝트</h2>
        <h3 class="project-name"><span aria-hidden="true">${esc(alternate.flag)}</span> ${esc(projectTitle(alternate))}</h3>
        <p>${esc(alternate.summary)}</p>
        <details><summary>추천 이유와 모집 분야 보기</summary>
          ${renderEvidence(alternate, 1) || '<p>전체 답변을 바탕으로 함께 살펴볼 프로젝트예요.</p>'}
          <div class="skill-tags">${alternate.roles.map(r => `<span>${esc(r)}</span>`).join('')}</div>
        </details>
      </section>
      <section class="result-section">
        <h2>이런 점이 궁금하다면?</h2>
        <p class="mentor-question">“${esc(mentorQuestionFor(primary))}”</p>
        <p class="mentor-invite">비밀과외에서 선배에게 물어보세요.</p>
        <div class="follow-up">${mentoringLink}${recruitmentLink}</div>
      </section>
      <div class="result-actions">
        <button id="edit" class="text-button">← 답변 돌아보기</button>
        <button id="copy" class="button secondary">결과 복사</button>
        <button id="restart" class="button secondary">다시 테스트 ↻</button>
      </div>
      <p id="copy-status" class="small-note" role="status"></p>
      <textarea id="copy-text" aria-label="복사할 결과 요약" rows="5" readonly hidden></textarea>
      <p class="disclaimer">${esc(data.disclaimer)}</p>
    </section>${reviewPanel(result)}`;

    trackAttempt('test-complete', '테스트 완료');
    document.getElementById('edit').onclick = () => {
      state.screen = 'quiz';
      state.index = data.questions.length - 1;
      render();
    };
    document.getElementById('restart').onclick = reset;
    document.getElementById('copy').onclick = async () => {
      const summary = [
        '나의 해외봉사 캐릭터는?', `${character.name} · ${role.name}`,
        `관심 프로젝트 · ${projectTitle(primary)}`,
        `또 다른 관심 프로젝트 · ${projectTitle(alternate)}`
      ].join('\n');
      const status = document.getElementById('copy-status');
      const field = document.getElementById('copy-text');
      try {
        await navigator.clipboard.writeText(summary);
        status.textContent = '결과를 복사했어요.';
      } catch {
        field.hidden = false;
        field.value = summary;
        field.focus();
        field.select();
        if (document.execCommand && document.execCommand('copy')) {
          field.hidden = true;
          document.getElementById('copy').focus();
          status.textContent = '결과를 복사했어요.';
        } else {
          status.textContent = '선택된 내용을 복사해 주세요.';
        }
      }
    };
  }

  function reset() {
    state.screen = 'intro';
    state.index = 0;
    state.answers = {};
    state.mentorQuestions.clear();
    trackedEvents.clear();
    render();
  }

  function render(moveFocus = true) {
    if (state.screen === 'intro') renderIntro();
    else if (state.screen === 'quiz') renderQuiz();
    else renderResult();
    if (moveFocus) {
      app.querySelector('h1').focus({preventScroll: true});
      root.scrollTo(0, 0);
    }
  }

  document.getElementById('home').onclick = reset;
  document.getElementById('review-toggle')?.addEventListener('click', event => {
    state.review = !state.review;
    event.currentTarget.setAttribute('aria-pressed', String(state.review));
    event.currentTarget.textContent = state.review ? '검토 모드 닫기' : '초안 검토 모드';
    render(false);
  });
  render(false);
})(typeof window !== 'undefined' ? window : globalThis);
