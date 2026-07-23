import { StubScreen } from '@/components/stub-screen';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewProspectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <StubScreen
      config={{
        screenId: 'UI-03',
        title: 'Manual organization entry',
        description: 'Validate, duplicate check, and create organizations.',
        requiredRoles: ['admin', 'sales'],
        primaryActions: ['Validate', 'Duplicate check', 'Create'],
      }}
      searchParams={params}
    >
      <form className="form-panel">
        <label htmlFor="org-name">
          Organization name
          <input id="org-name" name="orgName" type="text" required />
        </label>
        <label htmlFor="firm-type">
          Firm type
          <select id="firm-type" name="firmType" defaultValue="ria">
            <option value="ria">RIA</option>
            <option value="broker_dealer">Broker-dealer</option>
            <option value="family_office">Family office</option>
          </select>
        </label>
        <label htmlFor="contact-email">
          Primary contact email
          <input id="contact-email" name="contactEmail" type="email" />
        </label>
        <button type="button">Submit for validation</button>
      </form>
    </StubScreen>
  );
}
