

/**
 * Minimaler Klassen-Decorator
 */

function classDecorator<C extends abstract new (...args: any[]) => any>(
  value: C,
  context: ClassDecoratorContext<C>
): C | void {
  context.addInitializer(function initializer(this: C){});
  // return; // ok
  // return value; // ok
  // return class extends value { foo = 42 } // ok (ohne abstract-Bedingung in C)
}

@classDecorator class TestClassDecorator {
}



/**
 * Minimaler Accessor-Decorator
 */

function accessorDecorator<This, Value>(
  value: ClassAccessorDecoratorTarget<This, Value>, // { get, set }
  context: ClassAccessorDecoratorContext<This, Value>
): ClassAccessorDecoratorResult<This, Value> | void {
  context.addInitializer(function init(this: This) {});
  // return; // ok
  // return value; // ok
  // return { ...value, init() { return value.get.call(this) } } // ok
}

class TestAccessorDecorator {
  @accessorDecorator accessor foo: number = 42;
}



/**
 * Minimaler Methoden-Decorator
 */

function methodDecorator<This, Value extends (this: This, ...args: any) => any>(
  value: Value,
  context: ClassMethodDecoratorContext<This, Value>
): Value | void {
  context.addInitializer(function init(this: This) {});
}

class TestMethodDecorator {
  @methodDecorator foo(): void {}
}



/**
 * Minimaler Feld-Decorator
 */

function fieldDecorator<This, Value>(
  value: Value,
  context: ClassFieldDecoratorContext<This, Value>
): ((initialValue: Value | undefined) => Value) | void {
  context.addInitializer(function init(this: This) {});
  // return (initialValue: Value | undefined) => initialValue;
}

class TestFieldDecorator {
  @fieldDecorator foo: number | undefined = 42;
}



/**
 * Minimale Getter/Setter-Decorators
 */

function getDecorator<This, Value>(
  value: Value,
  context: ClassGetterDecoratorContext<This, Value>
) {
  context.addInitializer(function init(this: This) {});
  // return (initialValue: Value | undefined) => initialValue;
  return value;
}

function setDecorator<This, Value>(
  value: Value,
  context: ClassSetterDecoratorContext<This, Value>
): ((x: Value) => any) | void {
  context.addInitializer(function init(this: This) {});
  // return (initialValue: Value | undefined) => initialValue;
}

class TestGetSetDecorator {
  @getDecorator()
  get foo(): number { return 1; }

  @setDecorator()
  set foo(x) {}
}
