// View: the Relay job board. Pure DOM building; the controller decides what "Take job" and "Give up" do
// (offers, pay and deadlines come from domain/jobs — this only shows them).
import { STRINGS } from '../i18n';

export interface JobCardView {
  id: string;
  /** "12 Lock Street" */
  name: string;
  /** "Canal Side" */
  district: string;
  /** Tag on the card: Parcel / Express / Fragile. */
  tag: string;
  /** One line about what makes the job special. */
  hint: string;
  distance: number;
  payout: number;
}

export interface JobBoardOptions {
  offers: readonly JobCardView[];
  carried: readonly JobCardView[];
  /** False when the courier's hands are full (offers are shown but cannot be taken). */
  canTake: boolean;
  onTake: (id: string) => void;
  onGiveUp: (id: string) => void;
}

export function buildJobBoard(o: JobBoardOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'shop job-board';
  const intro = document.createElement('p');
  intro.className = 'vendor-greeting';
  intro.textContent = STRINGS.jobs.boardIntro;
  wrap.append(intro);

  const card = (job: JobCardView, button: { label: string; disabled: boolean; onClick: () => void }, extraClass = ''): HTMLElement => {
    const el = document.createElement('div');
    el.className = `card job-card ${extraClass}`.trim();
    const h = document.createElement('h3');
    h.textContent = job.name;
    const tag = document.createElement('span');
    tag.className = 'vendor-kind';
    tag.textContent = job.tag;
    h.append(' ', tag);
    const where = document.createElement('p');
    where.textContent = `${job.district} · ${STRINGS.jobs.distance(job.distance)} · ${STRINGS.jobs.pay(job.payout)}`;
    const hint = document.createElement('p');
    hint.className = 'job-hint';
    hint.textContent = job.hint;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = button.label;
    btn.disabled = button.disabled;
    btn.setAttribute('aria-label', `${job.name}: ${button.label}`);
    btn.addEventListener('click', () => {
      btn.disabled = true;
      button.onClick();
    });
    el.append(h, where, hint, btn);
    return el;
  };

  if (o.carried.length > 0) {
    const head = document.createElement('p');
    head.className = 'job-section';
    head.textContent = STRINGS.jobs.carrying;
    wrap.append(head);
    for (const job of o.carried) wrap.append(card(job, { label: STRINGS.jobs.giveUp, disabled: false, onClick: () => o.onGiveUp(job.id) }, 'carried'));
  }

  if (o.offers.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = STRINGS.jobs.boardEmpty;
    wrap.append(empty);
  } else if (!o.canTake) {
    const full = document.createElement('p');
    full.className = 'muted';
    full.textContent = STRINGS.jobs.handsFull;
    wrap.append(full);
  }
  for (const job of o.offers) wrap.append(card(job, { label: STRINGS.jobs.take, disabled: !o.canTake, onClick: () => o.onTake(job.id) }));
  return wrap;
}
