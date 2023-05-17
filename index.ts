// Stores *all* attributes defined via @attribute. Attribute observation on
// custom elements works only when we declare a static getter for the list of
// attributes on the component class. This getter gets called before the the
// decorators initialize, but after the decorator functions are evaluated. This
// enabled us to store all attribute names in this set, but they are at this
// point not yet associated with any particular element class. The
// attributeChangedCallback() has to perform some additional filtering to ensure
// that it only gets called for attributes that actually concern the element in
// question.
const potentiallyObservedAttributes = new Set<string>();

// Maps records of attribute metadata, namely symbols and a transformer
// function, to attributes names grouped by custom element constructors. This
// enables the attributeChangedCallback() to to the aforementioned filtering and
// also allows the callback to access the actual attribute data storage via the
// symbol.
const attributeMetadata = new Map<
  Function,
  Record<string, { key: symbol; transformer: (input: unknown) => any }>
>();

// Overly precise description of what the @define decorator returns
type ExtendedCustomElementConstructor =
  { readonly observedAttributes: string[] } &
  (new (...args: ConstructorParameters<CustomElementConstructor>) =>
    HTMLElement & {
      attributeChangedCallback(name: string, prev: string, next: string): void
    }
  );

// Define a custom element with a given tag name and also perform some
// additional setup the make @attribute work.
function define<T extends CustomElementConstructor>(
  tagName: `${string}-${string}`
): (
  target: T,
  context: ClassDecoratorContext<T>
) => void {
  return function(
    target: T,
    context: ClassDecoratorContext<T>
  ): ExtendedCustomElementConstructor {
    // Register the element with the custom element registry once all other
    // decorators have been applied (eg. when the class decorator initializer
    // runs).
    context.addInitializer(function() {
      window.customElements.get(tagName)
      ?? window.customElements.define(tagName, this);
    });

    //
    return class extends target {

      //
      static get observedAttributes(): string[] {
        // if target.observedAttributes
        return Array.from(potentiallyObservedAttributes);
      }

      attributeChangedCallback(
        name: string,
        oldValue: string,
        newValue: string
      ): void {
        // Bases custom element classes may or may not have defined an
        // attributeChangedCallback() themselves, but we can't know whether or
        // not this is the case. If an attributeChangedCallback() already
        // exists, we must call it to keep it working, but we can't check if
        // super contains "attributeChangedCallback" - only member access and
        // calls are valid syntax. Optional chaining the call works at runtime,
        // but TS does not know that this makes it irrelevant whether
        // "attributeChangedCallback" actually exists. So ignoring the following
        // line is the only remaining course of action.
        // @ts-ignore
        super.attributeChangedCallback?.(name, oldValue, newValue);
        // Everything below is just to handle @attribute
        if (oldValue === newValue) {
          return;
        }
        const relevantAttributes = attributeMetadata.get(this.constructor);
        if (relevantAttributes) {
          const names = Object.keys(relevantAttributes);
          if (names.includes(name)) {
            const key = relevantAttributes[name].key;
            const transformedValue = relevantAttributes[name].transformer(newValue);
            if (this[key] !== transformedValue) {
              this[key] = transformedValue;
            }
          }
        }
      }
    };
  };
}

type ClassAccessorDecorator<T, V, R extends ClassAccessorDecoratorResult<unknown, unknown> | void = ClassAccessorDecoratorResult<T, V>> = (
  target: ClassAccessorDecoratorTarget<T, V>,
  context: ClassAccessorDecoratorContext<T, V>
) => R;

// Accessor decorator @attribute. Looks simple when used, but requires some
// substantial JavaScript gymnastics to get working properly.
function attribute<T extends HTMLElement, V>(
  transformer: AttributeTransformer<V>
): ClassAccessorDecorator<T, V> {
  const to = transformer.to ?? String;
  const from = transformer.from;
  return function(
    target: ClassAccessorDecoratorTarget<T, V>,
    context: ClassAccessorDecoratorContext<T, V>
  ): ClassAccessorDecoratorResult<T, V> {
    if (context.kind !== "accessor") {
      throw new TypeError("@attribute is an accessor decorator");
    }

    // Accessor decorators can be applied to symbol accessors, but DOM attribute
    // names must be strings.
    const attrName = context.name;
    if (typeof attrName === "symbol") {
      throw new TypeError("Attribute names must be strings");
    }

    // For reasons outlined at the definition of potentiallyObservedAttributes,
    // we need to keep track of *all* attributes that have been declared by the
    // @attribute decorator.
    potentiallyObservedAttributes.add(attrName);

    // Shared secret key for the actual place where attribute data gets stored.
    // It can't be stored in private fields, as those won't be accessible to
    // subclasses like the one the @define has to create in order to support
    // attribute changes.
    const key = Symbol();

    // Setup the attribute metadata when the decorator initializes. This is the
    // earliest point at which we know the element the attribute that defined
    // for.
    context.addInitializer(function() {
      const metadata = attributeMetadata.get(this.constructor);
      if (!metadata) {
        attributeMetadata.set(
          this.constructor,
          { attrName: { key, transformer: from } }
        );
        return;
      }
      metadata[attrName] = { key, transformer: from };
    });

    // Ignore the private field and store the data behind the symbol while
    // keeping the attribute up to date.
    return {
      init(input) {
        const attrValue = this.getAttribute(attrName);
        if (attrValue !== null) {
          const value = from(attrValue);
          this[key] = value;
          return value;
        }
        this[key] = input;
        return input;
      },
      set (input) {
        this[key] = input;
        const attrValue = to(input);
        this.setAttribute(attrName, attrValue);
      },
      get() {
        return this[key];
      },
    }
  };
}

function shadow<This extends HTMLElement>(
  init?: ShadowRootInit
): (
  _: unknown,
  context: ClassFieldDecoratorContext<This, ShadowRoot>
) => () => ShadowRoot {
  return function(
    _: unknown,
    context: ClassFieldDecoratorContext<This, ShadowRoot>
  ): () => ShadowRoot {
    if (context.kind !== "field") {
      throw new TypeError(`@shadow is a field decorator, was called as ${context.kind} decorator`);
    }
    return function(this: This): ShadowRoot {
      return this.attachShadow({ mode: "open", ...init });
    }
  }
}

type Handler<T, K = string> = K extends keyof HTMLElementEventMap
  ? (this: T, event: HTMLElementEventMap[K]) => void
  : (this: T, event: Event) => void;

type HandleDecorator<T, K = string> =
  (value: Handler<T, K>, context: ClassMethodDecoratorContext<T, Handler<T, K>>) => void;

function handle<T extends HTMLElement, K extends keyof HTMLElementEventMap>(type: K): HandleDecorator<T, K>;
function handle<T extends HTMLElement>(type: string): HandleDecorator<T>;
function handle<T extends HTMLElement>(type: string): HandleDecorator<T> {
  return function (value: Handler<T>, context: ClassMethodDecoratorContext<T, Handler<T>>): void {
    context.addInitializer(function() {
      this.addEventListener(type, (evt) => value.call(this, evt))
    })
  }
}

import { AttributeTransformer, number } from "./attributeTransformers";

export @define("counter-element") class CounterElement extends HTMLElement {
  @attribute(number()) accessor value: number = 9001;

  @handle("click") increment(evt: MouseEvent): void {
    this.value += 1;
  }
}




declare global {
  interface HTMLElementTagNameMap {
    "counter-element": CounterElement;
  }
}



/*
function extendCustomElement<T extends CustomElementConstructor>(input: T) {
  return class extends input {
    attributeChangedCallback() {
      // Call this if the input class has attributeChangedCallback() defined
      super.attributeChangedCallback();
      console.log("B");
    }
  }
}
*/
