/*import "./components/counter-element.ts";
document.documentElement.append(document.createElement("counter-element"));
*/

import "./components/scroll-progress";

for (let i = 0; i < 100; i++) {
  const p = document.createElement("p");
  p.innerHTML = `Line ${i}`;
  document.body.append(p);
}

document.body.append(document.createElement("scroll-progress"));
