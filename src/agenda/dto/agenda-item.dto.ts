import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const ISO_8601_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

@ValidatorConstraint({ name: 'endsAfterStartsAt', async: false })
class EndsAfterStartsAtConstraint implements ValidatorConstraintInterface {
  validate(endsAt: unknown, args: ValidationArguments) {
    const startsAt = (args.object as { startsAt?: unknown }).startsAt;
    if (typeof startsAt !== 'string' || typeof endsAt !== 'string') {
      return true;
    }

    const startTime = Date.parse(startsAt);
    const endTime = Date.parse(endsAt);
    return Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      endTime > startTime;
  }

  defaultMessage() {
    return 'endsAt deve ser posterior a startsAt.';
  }
}

export function IsAfterStartsAt(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      target: target.constructor,
      propertyName,
      options,
      validator: EndsAfterStartsAtConstraint,
    });
  };
}

export { ISO_8601_WITH_TIMEZONE };
