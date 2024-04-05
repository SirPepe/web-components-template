import { html, render } from "uhtml";
import {
  debounce,
  define,
  prop,
  reactive,
  number,
  init,
} from "@sirpepe/ornament";

@define("scroll-progress")
export class ScrollProgressElement extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });
  #style = html`<style>
    :host {
      display: block;
      height: 8px;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
    }
    .progress {
      height: 100%;
      transition: var(--scroll-progress-transition, all 500ms);
      background-color: var(--scroll-progress-background, #c00);
    }
  </style>`;

  @prop(number({ min: 0, max: 100 }))
  accessor #value = 0;

  constructor() {
    super();
    this.ownerDocument.addEventListener("scroll", this.#handler);
  }

  @debounce({ fn: debounce.timeout(50) }) #handler = () => {
    /* eslint-disable */
    const position =
      (window.scrollY /
        (document.documentElement.offsetHeight -
          document.documentElement.clientHeight)) * 100;
    /* eslint-enable */
    this.#value = position;
  };

  get value() {
    return this.#value;
  }

  @init()
  @reactive()
  #render() {
    render(
      this.#root,
      html`
        ${this.#style}
        <div class="progress" style="${`width:${this.#value}%`}"></div>
      `,
    );
  }
}
