const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'dist');
const publicPages = [
  '404.html',
  'about.html',
  'admissions.html',
  'apply.html',
  'contact.html',
  'courses.html',
  'downloads.html',
  'facilities.html',
  'faculty.html',
  'faq.html',
  'gallery.html',
  'index.html',
  'news.html',
  'profile.html',
  'programs.html',
  'results.html',
  'student-life.html'
];

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const page of publicPages) {
  fs.copyFileSync(path.join(projectRoot, page), path.join(outputDirectory, page));
}

for (const asset of ['style.css', 'script.js']) {
  const source = path.join(projectRoot, 'assets', asset);
  const destination = path.join(outputDirectory, 'assets', asset);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.cpSync(
  path.join(projectRoot, 'images'),
  path.join(outputDirectory, 'images'),
  { recursive: true }
);

console.log(`Built ${publicPages.length} public pages for static hosting.`);
