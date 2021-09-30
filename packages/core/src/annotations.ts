type TAnnotationMap = WeakMap<Function, {
  constructor?: any[],
  [key: string]: any[],
}>;

const annotationMap = new WeakMap<Function | object, TAnnotationMap>();

export type TAnnotationType = 'method-static' | 'method-instance' | 'class';

export default function createAnnotation(name, validPositions: TAnnotationType[]) {
  function annotation(...args: any[]) {
    // classOrPrototype can be:
    // - the prototype (instance methods)
    // - the class itself (static method, constructor)
    // - the instance (instance fields)
    return function decorate(classOrPrototype, propertyKey: string) {
      if (propertyKey) {
        if (!validPositions.includes('method-static') && !validPositions.includes('method-instance')) {
          throw new Error(`Annotation @${name} cannot be used on a Class Property (${stringifyDecoratorPosition(classOrPrototype, propertyKey)})`);
        }

        if (typeof classOrPrototype === 'function' && !validPositions.includes('method-static')) {
          throw new Error(`Annotation @${name} cannot be used on a Static Property (${stringifyDecoratorPosition(classOrPrototype, propertyKey)})`);
        }

        if (typeof classOrPrototype !== 'function' && !validPositions.includes('method-instance')) {
          throw new Error(`Annotation @${name} cannot be used on an Instance Property (${stringifyDecoratorPosition(classOrPrototype, propertyKey)})`);
        }
      }

      if (!propertyKey && !validPositions.includes('class')) {
        throw new Error(`Annotation @${name} cannot be used on a Class Constructor (${stringifyDecoratorPosition(classOrPrototype, propertyKey)})`);
      }

      if (!annotationMap.has(classOrPrototype)) {
        annotationMap.set(classOrPrototype, new WeakMap());
      }

      const annotations: TAnnotationMap = annotationMap.get(classOrPrototype);
      if (!annotations.has(annotation)) {
        // @ts-expect-error
        annotations.set(annotation, {});
      }

      const classAnnotations = annotations.get(annotation);
      const key = propertyKey ?? 'constructor';
      if (key in classAnnotations) {
        throw new Error(`Annotation @${name} has been used twice on ${stringifyDecoratorPosition(classOrPrototype, propertyKey)}`);
      }

      classAnnotations[key] = args;
    };
  }

  Object.defineProperty(annotation, 'name', { value: name });

  return annotation;
}

export function getClassAnnotation(aClass: Function, annotation: Function): null | any[] {

  const classData = annotationMap.get(aClass);
  if (!classData) {
    return null;
  }

  const annotationData = classData.get(annotation);
  if (!annotationData) {
    return null;
  }

  return annotationData.constructor ?? null;
}

export function getPropertyAnnotation(
  classOrInstance: Function | object,
  annotation: Function,
): { [key: string]: any[] } {
  // TODO: if we need to support fields, these are actually placed on the instance itself.
  // this is an instance but instance-methods are on the prototype
  if (typeof classOrInstance === 'object') {
    classOrInstance = classOrInstance.constructor.prototype;
  }

  const classData = annotationMap.get(classOrInstance);
  if (!classData) {
    return {};
  }

  const annotationData = classData.get(annotation);
  if (!annotationData) {
    return {};
  }

  const { constructor: ignore, ...otherFields } = annotationData;

  return otherFields;
}

function stringifyDecoratorPosition(aClass, propertyKey) {
  if (!propertyKey) {
    return `Class ${aClass.name}`;
  }

  if (typeof aClass === 'function') {
    return `${aClass.name}.${propertyKey}`;
  }

  return `${aClass.name}#${propertyKey}`;
}
