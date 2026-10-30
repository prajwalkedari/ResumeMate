import type { ReactNode } from 'react';
import type { Fields, Resume, TemplateId } from '@/lib/resume';

const STYLE = {
  classic: { font: 'font-serif', head: 'border-b border-navy/30 pb-5 text-center', h2: 'border-b border-navy/25 pb-1 font-semibold text-navy', gap: 'mt-7', meta: 'italic text-ink/70' },
  modern: { font: 'font-sans', head: 'border-l-[6px] border-navy pl-5', h2: 'font-semibold tracking-tight text-navy', gap: 'mt-8', meta: 'text-ink/60' },
  minimal: { font: 'font-sans', head: '', h2: 'text-sm font-medium text-ink/50', gap: 'mt-12', meta: 'text-ink/50' },
  technical: { font: 'font-mono text-[12px]', head: 'border-b-2 border-ink pb-4', h2: 'border-b border-ink/40 pb-1 font-bold text-ink', gap: 'mt-6', meta: 'text-ink/60' },
} satisfies Record<TemplateId, Record<string, string>>;

type Style = (typeof STYLE)[TemplateId];

const filled = (xs: Fields[]) => xs.filter((x) => Object.values(x).some((v) => v?.trim()));
const href = (v: string) => (/^https?:\/\//.test(v) ? v : `https://${v}`);
const bare = (v: string) => v.replace(/^https?:\/\//, '');

function Section({ title, s, children }: { title: string; s: Style; children: ReactNode }) {
  return (
    <section className={s.gap}>
      <h2 className={`text-[13px] ${s.h2}`}>{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export function ResumeDocument({ resume, template }: { resume: Resume; template: TemplateId }) {
  const s = STYLE[template];
  const p = resume.personal;
  const contact = [p.email, p.phone, p.city].filter(Boolean).join('  |  ');
  const links = [p.linkedin, p.github, p.portfolio].filter(Boolean);
  const skills = Object.entries(resume.skills).filter(([, v]) => v?.trim());
  const skillLabels: Record<string, string> = { languages: 'Languages', frameworks: 'Frameworks', databases: 'Databases', tools: 'Tools' };

  return (
    <article className={`${s.font} mx-auto bg-white p-14 text-[13px] leading-relaxed text-ink`} style={{ width: 794, minHeight: 1123 }}>
      <header className={s.head}>
        <h1 className="text-[30px] font-semibold leading-tight text-navy">{p.name || 'Your name'}</h1>
        {contact && <p className={`mt-2 text-[12px] ${s.meta}`}>{contact}</p>}
        {links.length > 0 && (
          <p className="mt-1 text-[12px]">
            {links.map((l, i) => (
              <span key={l}>
                {i > 0 && '  |  '}
                <a className="underline decoration-navy/40 underline-offset-2" href={href(l)} target="_blank" rel="noreferrer">{bare(l)}</a>
              </span>
            ))}
          </p>
        )}
      </header>

      {resume.summary?.trim() && (
        <Section title="Summary" s={s}><p>{resume.summary}</p></Section>
      )}

      {filled(resume.experience).length > 0 && (
        <Section title="Experience" s={s}>
          {filled(resume.experience).map((e, i) => (
            <div key={i} className="mb-4 last:mb-0">
              <div className="flex justify-between gap-4">
                <p className="font-semibold">{e.role}{e.company && ` at ${e.company}`}</p>
                <p className={s.meta}>{e.dates}</p>
              </div>
              <p className="mt-1 whitespace-pre-line">{e.details}</p>
            </div>
          ))}
        </Section>
      )}

      {filled(resume.education).length > 0 && (
        <Section title="Education" s={s}>
          {filled(resume.education).map((e, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <p className="font-semibold">{e.degree}</p>
              <p className={s.meta}>{[e.institution, e.year, e.grade].filter(Boolean).join(', ')}</p>
              {e.coursework && <p className="mt-1">Coursework: {e.coursework}</p>}
            </div>
          ))}
        </Section>
      )}

      {skills.length > 0 && (
        <Section title="Skills" s={s}>
          {skills.map(([k, v]) => (
            <p key={k}><span className="font-semibold">{skillLabels[k] ?? k}: </span>{v}</p>
          ))}
        </Section>
      )}

      {filled(resume.projects).length > 0 && (
        <Section title="Projects" s={s}>
          {filled(resume.projects).map((pr, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <p className="font-semibold">{pr.title}{pr.tech && <span className={`font-normal ${s.meta}`}> | {pr.tech}</span>}</p>
              <p className="mt-0.5 whitespace-pre-line">{pr.details}</p>
              {pr.link && <p className={`text-[12px] ${s.meta}`}>{pr.link}</p>}
            </div>
          ))}
        </Section>
      )}

      {filled(resume.certifications).length > 0 && (
        <Section title="Certifications" s={s}>
          {filled(resume.certifications).map((c, i) => (
            <p key={i}>{c.name}{c.issuer && `, ${c.issuer}`}{c.year && ` (${c.year})`}</p>
          ))}
        </Section>
      )}

      {filled(resume.achievements).length > 0 && (
        <Section title="Achievements" s={s}>
          {filled(resume.achievements).map((a, i) => (
            <div key={i} className="mb-2 last:mb-0">
              <p className="font-semibold">{a.title}</p>
              {a.details && <p>{a.details}</p>}
            </div>
          ))}
        </Section>
      )}
    </article>
  );
}

export function ScaledResume({ resume, template, scale }: { resume: Resume; template: TemplateId; scale: number }) {
  return (
    <div className="shrink-0 overflow-hidden border border-line bg-white shadow-sm" style={{ width: 794 * scale, height: 1123 * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 794 }}>
        <ResumeDocument resume={resume} template={template} />
      </div>
    </div>
  );
}
