import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/w/$workspaceSlug/onboarding')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/w/$workspaceSlug',
      params: { workspaceSlug: params.workspaceSlug },
    });
  },
  component: () => null,
});
