import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';
import { ValidationFailedException } from '../errors/app.exception';
import { createValidationPipe } from './validation.pipe';

class AddressDto {
  @IsString()
  @IsNotEmpty()
  city!: string;
}

class SampleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();
  const metadata = { type: 'body' as const, metatype: SampleDto };

  async function captureError(value: unknown): Promise<ValidationFailedException> {
    try {
      await pipe.transform(value, metadata);
    } catch (error) {
      if (error instanceof ValidationFailedException) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected validation to fail');
  }

  it('returns a transformed instance for valid input', async () => {
    const result: unknown = await pipe.transform(
      { name: 'Biryani', quantity: 2, address: { city: 'Lahore' } },
      metadata,
    );
    expect(result).toBeInstanceOf(SampleDto);
  });

  it('reports field-level errors with nested paths', async () => {
    const error = await captureError({ name: '', quantity: 0, address: { city: '' } });
    const fields = (error.details ?? []).map((detail) => detail.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'quantity', 'address.city']));
  });

  it('rejects properties that are not whitelisted', async () => {
    const error = await captureError({
      name: 'Karahi',
      quantity: 1,
      address: { city: 'Karachi' },
      restaurantId: 'someone-else',
    });
    expect(error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'restaurantId' })]),
    );
  });
});
