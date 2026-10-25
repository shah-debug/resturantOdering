import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  Button,
  Field,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  Switch,
} from '.';

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

  it('renders a child element as a button with asChild', () => {
    render(
      <Button asChild variant="outline">
        <a href="/settings">Settings</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveAttribute('data-slot', 'button');
  });

  it('toggles a labelled switch', async () => {
    render(
      <>
        <Label htmlFor="delivery">Delivery</Label>
        <Switch id="delivery" />
      </>,
    );
    const toggle = screen.getByRole('switch', { name: 'Delivery' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('opens a sheet as an accessible dialog', async () => {
    render(
      <Sheet>
        <SheetTrigger>Open panel</SheetTrigger>
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetTitle>Navigation</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open panel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks the current breadcrumb page', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByText('Settings')).toHaveAttribute('aria-current', 'page');
  });
});
