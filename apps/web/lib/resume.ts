export type Fields = Record<string, string>;
export type TemplateId = 'classic' | 'modern' | 'minimal' | 'technical';

export type Resume = {
  personal: Fields;
  summary: string;
  education: Fields[];
  experience: Fields[];
  skills: Fields;
  projects: Fields[];
  certifications: Fields[];
  achievements: Fields[];
  target: Fields;
};

export type SectionId = keyof Resume;
export type FieldDef = [key: string, label: string, multiline?: boolean];
export type Section = {
  id: SectionId;
  title: string;
  kind: 'object' | 'list' | 'text';
  fields?: FieldDef[];
  hint?: string;
};

export const TEMPLATES: { id: TemplateId; name: string; note: string }[] = [
  { id: 'classic', name: 'Classic', note: 'Centered serif header with ruled section titles.' },
  { id: 'modern', name: 'Modern', note: 'Sans-serif with a navy rule beside the name.' },
  { id: 'minimal', name: 'Minimal', note: 'Open spacing and no rules.' },
  { id: 'technical', name: 'Technical', note: 'Monospace type for dense, scannable detail.' },
];

export const SECTIONS: Section[] = [
  { id: 'personal', title: 'Personal information', kind: 'object', fields: [['name', 'Full name'], ['email', 'Email'], ['phone', 'Phone'], ['city', 'City'], ['linkedin', 'LinkedIn URL'], ['github', 'GitHub URL'], ['portfolio', 'Portfolio URL']] },
  { id: 'summary', title: 'Professional summary', kind: 'text', hint: 'Two to four sentences on who you are and the role you want next.' },
  { id: 'education', title: 'Education', kind: 'list', fields: [['degree', 'Degree'], ['institution', 'Institution'], ['year', 'Graduation year'], ['grade', 'Grade or CGPA'], ['coursework', 'Relevant coursework', true]] },
  { id: 'experience', title: 'Experience and internships', kind: 'list', fields: [['role', 'Position'], ['company', 'Company'], ['dates', 'Dates'], ['details', 'Responsibilities and achievements, one per line', true]] },
  { id: 'skills', title: 'Skills', kind: 'object', fields: [['languages', 'Languages'], ['frameworks', 'Frameworks and libraries'], ['databases', 'Databases'], ['tools', 'Tools']] },
  { id: 'projects', title: 'Projects', kind: 'list', fields: [['title', 'Project title'], ['tech', 'Technologies'], ['link', 'Link'], ['details', 'Description and results', true]] },
  { id: 'certifications', title: 'Certifications and courses', kind: 'list', fields: [['name', 'Name'], ['issuer', 'Issuer'], ['year', 'Year']] },
  { id: 'achievements', title: 'Achievements and publications', kind: 'list', fields: [['title', 'Title'], ['details', 'Details', true]] },
  { id: 'target', title: 'Target job', kind: 'object', fields: [['jobTitle', 'Job title'], ['jobDescription', 'Job description', true]] },
];

const blankFields = (id: SectionId): Fields =>
  Object.fromEntries((SECTIONS.find((s) => s.id === id)?.fields ?? []).map(([k]) => [k, '']));

export const blankEntry = (id: SectionId): Fields => blankFields(id);

export const emptyResume: Resume = {
  personal: blankFields('personal'),
  summary: '',
  education: [],
  experience: [],
  skills: blankFields('skills'),
  projects: [],
  certifications: [],
  achievements: [],
  target: blankFields('target'),
};

// Fictional demonstration resume. Every name, institution, employer, link and
// figure below is invented. It is safe to show on the public landing page.
// Do not replace it with a real person's CV.
export const DEMO_LABEL = 'Fictional demonstration resume: Alex Morgan. Every field is editable.';
export const sampleResume: Resume = {
  personal: { name: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '', city: 'Example City, Country', linkedin: 'linkedin.com/in/alex-morgan-example', github: 'github.com/alex-morgan-example', portfolio: 'alex-morgan.example.com' },
  summary: 'Software engineer with a background in data analysis and backend services. Builds REST APIs, containerised deployments, and small open-source tools. Seeking an applied engineering role in machine learning.',
  education: [{ degree: 'B.Sc. in Computer Science', institution: 'Example State University', year: '2020 – 2024', grade: '', coursework: 'Algorithms, Databases, Machine Learning, Operating Systems' }],
  experience: [{ role: 'Data Analyst Intern', company: 'Sample Analytics Ltd.', dates: '2023 – 2024', details: 'Completed a six-month analytics internship.\nAnalysed sales data with Pandas and NumPy and produced weekly reports for the operations team.\nWrote SQL queries for reporting dashboards.' }],
  skills: { languages: 'Python, SQL, JavaScript, Java', frameworks: 'FastAPI, Flask, Express.js', databases: 'PostgreSQL, MySQL, SQLite', tools: 'Linux, Git, Docker, pandas, scikit-learn' },
  projects: [
    { title: 'Example CLI Toolkit', tech: 'Python, Linux CLI, packaging', link: 'github.com/alex-morgan-example/cli-toolkit', details: 'Published an open-source command-line utility with automated tests and documentation.' },
    { title: 'Malware Classifier Prototype', tech: 'Python, FastAPI, XGBoost, Docker', link: 'github.com/alex-morgan-example/classifier', details: 'Trained a classifier on file-header features and served predictions through a REST API.' },
  ],
  certifications: [{ name: 'Introductory Machine Learning Course', issuer: 'Example Online Academy', year: '2023' }],
  achievements: [
    { title: 'Regional programming contest', details: 'Placed in the top ten teams.' },
  ],
  target: { jobTitle: 'Applied Machine Learning Engineer', jobDescription: '' },
};

export function validateResume(r: Resume): string[] {
  const errs: string[] = [];
  if (!r.personal.name?.trim()) errs.push('Add your full name in Personal information.');
  if (!/^\S+@\S+\.\S+$/.test(r.personal.email ?? '')) errs.push('Add a valid email address in Personal information.');
  if (!r.education.length && !r.experience.length) errs.push('Add at least one education or experience entry.');
  return errs;
}
