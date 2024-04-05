import { render, html } from "uhtml";
import {
  define,
  attr,
  reactive,
  int,
  init,
  subscribe,
} from "@sirpepe/ornament";

type WithShadow<T extends HTMLElement = HTMLElement> = T & {
  root: ShadowRoot;
};

const handle = <T extends WithShadow>(eventName: string, selector: string) =>
  subscribe(
    function (instance: T) {
      return instance.root;
    },
    eventName,
    {
      predicate: (_, evt) =>
        evt.target instanceof HTMLElement && evt.target.matches(selector),
    },
  );

@define("counter-element")
export class CounterElement extends HTMLElement {
  root = this.attachShadow({ mode: "open" });

  @attr(int({ min: 0n }), { reflective: false })
  accessor value = 0n;

  @attr(int({ min: 1n }))
  accessor step = 1n;

  @handle("click", "button.plus")
  #increment(): void {
    this.value += this.step;
  }

  @handle("click", "button.minus")
  #decrement(): void {
    this.value -= this.step;
  }

  @init()
  @reactive()
  #render() {
    render(
      this.root,
      html`
        ${String(this.value)}
        <button ?disabled=${this.value + this.step > 9000} class="plus">
          + ${this.step}
        </button>
        <button ?disabled=${this.value - this.step < 0} class="minus">
          - ${this.step}
        </button>
      `,
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "counter-element": CounterElement;
  }
}
