import { copyFileSync, mkdirSync } from 'node:fs';
const copies = [
  ['node_modules/gsap/dist/gsap.min.js', 'assets/vendor/gsap.min.js'],
  ['node_modules/three/build/three.module.js', 'assets/vendor/three.module.js'],
  ['node_modules/three/build/three.core.js', 'assets/vendor/three.core.js'],
  ['node_modules/gsap/README.md', 'assets/vendor/GSAP-README.md'],
  ['node_modules/three/LICENSE', 'assets/vendor/THREE-LICENSE.txt'],
  ['../web/site/app/icon.svg', 'assets/trqsh-icon.svg'],
];
mkdirSync('assets/vendor', {recursive:true});
mkdirSync('assets/audio', {recursive:true});
mkdirSync('output', {recursive:true});
for (const [from, to] of copies) copyFileSync(from, to);
console.log('Local animation libraries and project logo prepared. No runtime CDN requests.');
