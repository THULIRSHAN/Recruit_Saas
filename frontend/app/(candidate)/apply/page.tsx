import { Suspense } from 'react';
import { ApplyForm } from './ApplyForm';

export default function ApplyPage() {
  return (
    <Suspense>
      <ApplyForm />
    </Suspense>
  );
}
