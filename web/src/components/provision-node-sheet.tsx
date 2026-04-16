import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/sheet';
import { Button, ErrorText, Field, Input, Select } from '@/components/ui';
import { useProvisionNode } from '@/lib/nodes';
import { ApiError } from '@/lib/api';

const LOCATIONS = ['nbg1', 'fsn1', 'hel1', 'ash', 'hil', 'sin'];

interface Props {
  workspaceSlug: string;
  defaultLocation?: string | null;
  defaultServerType?: string | null;
  children: ReactNode;
}

export function ProvisionNodeSheet({
  workspaceSlug,
  defaultLocation,
  defaultServerType,
  children,
}: Props) {
  const provision = useProvisionNode(workspaceSlug);
  const [open, setOpen] = useState(false);

  const [serverType, setServerType] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setServerType('');
    setLocation('');
    setError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await provision.mutateAsync({
        server_type: serverType.trim() || undefined,
        location: location.trim() || undefined,
      });
      reset();
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed',
      );
    }
  }

  const effectiveServerType =
    serverType || defaultServerType || 'cx22';
  const effectiveLocation = location || defaultLocation || 'nbg1';

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Provision node</SheetTitle>
          <SheetDescription>
            Create a Hetzner VM now. It becomes <span className="font-mono">ready</span> once the
            agent registers.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
          <Field
            label="Server type"
            htmlFor="prov-server-type"
            hint={`Blank → workspace default${defaultServerType ? ` (${defaultServerType})` : ' (cx22)'}`}
          >
            <Input
              id="prov-server-type"
              placeholder={defaultServerType ?? 'cx22'}
              value={serverType}
              onChange={(e) => setServerType(e.target.value)}
            />
          </Field>

          <Field
            label="Location"
            htmlFor="prov-location"
            hint={`Blank → workspace default (${defaultLocation ?? 'nbg1'})`}
          >
            <Select
              id="prov-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">(workspace default)</option>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <p className="text-xs text-[var(--color-muted)]">
            Will create{' '}
            <span className="font-mono">{effectiveServerType}</span> in{' '}
            <span className="font-mono">{effectiveLocation}</span>.
          </p>

          {error ? <ErrorText>{error}</ErrorText> : null}

          <div className="mt-auto flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={provision.isPending}>
              {provision.isPending ? 'Provisioning…' : 'Provision'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
