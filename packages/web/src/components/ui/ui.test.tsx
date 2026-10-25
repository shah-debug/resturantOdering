import { render, screen } from '@testing-library/react';
import { Alert, Button, Field, Input } from '.';

describe('ui primitives', () => {
  it('ties the label, hint and error to the control', () => {
    render(
      <Field label="Email" hint="We never share it" error="Enter a valid email address">
        {(control) => <Input type="email" {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('We never share it Enter a valid email address');
  });

  it('leaves the control valid when there is no error', () => {
    render(<Field label="Name">{(control) => <Input {...control} />}</Field>);

    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('disables a pending button and shows the pending text', () => {
    render(
      <Button pending pendingText="Saving…">
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('announces destructive alerts assertively', () => {
    render(<Alert variant="destructive" title="Failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });
});
