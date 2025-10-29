import { CRMAdapter, CRMProvider } from './types';
import { HubSpotAdapter } from './hubspot';
import { SalesforceAdapter } from './salesforce';
import { PipedriveAdapter } from './pipedrive';
import { ZohoAdapter } from './zoho';
import { GoHighLevelAdapter } from './gohighlevel';

export function createCRMAdapter(provider: CRMProvider): CRMAdapter {
  switch (provider) {
    case 'hubspot':
      return new HubSpotAdapter();
    case 'salesforce':
      return new SalesforceAdapter();
    case 'pipedrive':
      return new PipedriveAdapter();
    case 'zoho':
      return new ZohoAdapter();
    case 'gohighlevel':
      return new GoHighLevelAdapter();
    default:
      throw new Error(`Unsupported CRM provider: ${provider}`);
  }
}

export const SUPPORTED_CRMS: { value: CRMProvider; label: string }[] = [
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'pipedrive', label: 'Pipedrive' },
  { value: 'zoho', label: 'Zoho CRM' },
  { value: 'gohighlevel', label: 'GoHighLevel' },
];