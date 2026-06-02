const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('RAILWAY_API_TOKEN is not set');

  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await res.json()) as GraphQLResponse<T>;
  if (!res.ok || body.errors?.length) {
    const msg = body.errors?.map((e) => e.message).join('; ') ?? res.statusText;
    throw new Error(`Railway API error: ${msg}`);
  }
  if (!body.data) throw new Error('Railway API returned no data');
  return body.data;
}

export async function listProjectServices(): Promise<
  { id: string; name: string }[]
> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  if (!projectId) throw new Error('RAILWAY_PROJECT_ID is not set');

  const data = await graphql<{
    project: { services: { edges: { node: { id: string; name: string } }[] } };
  }>(
    `
      query ProjectServices($id: String!) {
        project(id: $id) {
          services {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `,
    { id: projectId }
  );
  return data.project.services.edges.map((e) => e.node);
}

export async function createBotService(input: {
  tenantSlug: string;
  image: string;
  envVars: Record<string, string>;
}): Promise<{ serviceId: string; environmentId: string }> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  if (!projectId) throw new Error('RAILWAY_PROJECT_ID is not set');

  // Railway's serviceCreate mutation. The template-based flow is also
  // available via templateDeploy but the direct path is simpler once the
  // image is hosted on a public registry (ghcr).
  const data = await graphql<{
    serviceCreate: {
      id: string;
      project: { environments: { edges: { node: { id: string } }[] } };
    };
  }>(
    `
      mutation CreateService($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          project {
            environments {
              edges { node { id } }
            }
          }
        }
      }
    `,
    {
      input: {
        projectId,
        name: `bot-${input.tenantSlug}`,
        source: { image: input.image },
      },
    }
  );

  const serviceId = data.serviceCreate.id;
  const environmentId =
    data.serviceCreate.project.environments.edges[0]?.node.id;
  if (!environmentId) throw new Error('Railway: no environment on project');

  await upsertServiceVariables({
    serviceId,
    environmentId,
    variables: input.envVars,
  });

  return { serviceId, environmentId };
}

export async function upsertServiceVariables(input: {
  serviceId: string;
  environmentId: string;
  variables: Record<string, string>;
}): Promise<void> {
  await graphql(
    `
      mutation VariableCollectionUpsert(
        $input: VariableCollectionUpsertInput!
      ) {
        variableCollectionUpsert(input: $input)
      }
    `,
    {
      input: {
        projectId: process.env.RAILWAY_PROJECT_ID,
        serviceId: input.serviceId,
        environmentId: input.environmentId,
        variables: input.variables,
      },
    }
  );
}

// The bot listens on this port; Railway needs it to route a custom domain.
const BOT_PORT = 3001;

export interface CustomDomainSetup {
  cnameTarget: string; // CNAME value to point the subdomain at
  verificationHost: string | null; // _railway-verify.{slug} (TXT name)
  verificationToken: string | null; // railway-verify=… (TXT value)
}

interface CustomDomainStatus {
  dnsRecords: { recordType: string; requiredValue: string }[];
  verificationDnsHost: string | null;
  verificationToken: string | null;
}

function mapStatus(status: CustomDomainStatus): CustomDomainSetup {
  const cname =
    status.dnsRecords.find((r) => /cname/i.test(r.recordType)) ??
    status.dnsRecords[0];
  return {
    cnameTarget: cname?.requiredValue ?? '',
    verificationHost: status.verificationDnsHost,
    verificationToken: status.verificationToken,
  };
}

const STATUS_FIELDS = `
  status {
    dnsRecords { recordType requiredValue }
    verificationDnsHost
    verificationToken
  }
`;

/**
 * Registers `domain` as a custom domain on the service and returns the DNS
 * records the caller must create (the CNAME target + Railway's ownership-
 * verification TXT). Idempotent: if the domain is already registered, reads the
 * existing records instead of failing. NOTE: `projectId` is required by
 * Railway's API — omitting it returns a generic "Problem processing request".
 */
export async function addCustomDomain(input: {
  projectId: string;
  serviceId: string;
  environmentId: string;
  domain: string;
}): Promise<CustomDomainSetup> {
  try {
    const data = await graphql<{
      customDomainCreate: { status: CustomDomainStatus };
    }>(
      `
        mutation CustomDomainCreate($input: CustomDomainCreateInput!) {
          customDomainCreate(input: $input) {
            id
            domain
            ${STATUS_FIELDS}
          }
        }
      `,
      {
        input: {
          projectId: input.projectId,
          environmentId: input.environmentId,
          serviceId: input.serviceId,
          domain: input.domain,
          targetPort: BOT_PORT,
        },
      }
    );
    return mapStatus(data.customDomainCreate.status);
  } catch {
    // Likely already registered — read the existing record.
    const existing = await getCustomDomainStatus(input);
    if (existing) return existing;
    throw new Error(`could not register or find custom domain ${input.domain}`);
  }
}

async function getCustomDomainStatus(input: {
  projectId: string;
  serviceId: string;
  environmentId: string;
  domain: string;
}): Promise<CustomDomainSetup | null> {
  const data = await graphql<{
    domains: {
      customDomains: { domain: string; status: CustomDomainStatus }[];
    };
  }>(
    `
      query Domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
        domains(
          projectId: $projectId
          environmentId: $environmentId
          serviceId: $serviceId
        ) {
          customDomains {
            domain
            ${STATUS_FIELDS}
          }
        }
      }
    `,
    {
      projectId: input.projectId,
      environmentId: input.environmentId,
      serviceId: input.serviceId,
    }
  );
  const match = data.domains.customDomains.find(
    (d) => d.domain === input.domain
  );
  return match ? mapStatus(match.status) : null;
}

/**
 * Returns a Railway-managed `*.up.railway.app` domain for the service, creating
 * one if needed. Works on every plan (unlike custom domains), so it's the URL
 * we health-check against and the immediate fallback while the custom domain's
 * cert is still provisioning.
 */
export async function getOrCreateServiceDomain(input: {
  projectId: string;
  serviceId: string;
  environmentId: string;
}): Promise<string> {
  const existing = await graphql<{
    domains: { serviceDomains: { domain: string }[] };
  }>(
    `
      query SvcDomains($projectId: String!, $environmentId: String!, $serviceId: String!) {
        domains(
          projectId: $projectId
          environmentId: $environmentId
          serviceId: $serviceId
        ) {
          serviceDomains {
            domain
          }
        }
      }
    `,
    {
      projectId: input.projectId,
      environmentId: input.environmentId,
      serviceId: input.serviceId,
    }
  );
  const found = existing.domains.serviceDomains[0]?.domain;
  if (found) return found;

  const created = await graphql<{ serviceDomainCreate: { domain: string } }>(
    `
      mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          domain
        }
      }
    `,
    {
      input: {
        environmentId: input.environmentId,
        serviceId: input.serviceId,
        targetPort: BOT_PORT,
      },
    }
  );
  return created.serviceDomainCreate.domain;
}

export async function pauseService(
  serviceId: string,
  environmentId: string
): Promise<void> {
  await setReplicas({ serviceId, environmentId, numReplicas: 0 });
}

export async function resumeService(
  serviceId: string,
  environmentId: string
): Promise<void> {
  await setReplicas({ serviceId, environmentId, numReplicas: 1 });
}

async function setReplicas(input: {
  serviceId: string;
  environmentId: string;
  numReplicas: number;
}): Promise<void> {
  await graphql(
    `
      mutation ServiceInstanceUpdate(
        $serviceId: String!
        $environmentId: String!
        $input: ServiceInstanceUpdateInput!
      ) {
        serviceInstanceUpdate(
          serviceId: $serviceId
          environmentId: $environmentId
          input: $input
        )
      }
    `,
    {
      serviceId: input.serviceId,
      environmentId: input.environmentId,
      input: { numReplicas: input.numReplicas },
    }
  );
}

/**
 * Returns the status of the service's most recent deployment (e.g. BUILDING,
 * DEPLOYING, SUCCESS, FAILED, CRASHED), or null if there are no deployments
 * yet. Used to surface deploy failures in the live provisioning log instead of
 * silently waiting out the health poll.
 */
export async function getLatestDeploymentStatus(input: {
  serviceId: string;
  environmentId: string;
}): Promise<string | null> {
  const data = await graphql<{
    deployments: { edges: { node: { status: string } }[] };
  }>(
    `
      query LatestDeployment($serviceId: String!, $environmentId: String!) {
        deployments(
          input: { serviceId: $serviceId, environmentId: $environmentId }
          first: 1
        ) {
          edges {
            node {
              status
            }
          }
        }
      }
    `,
    { serviceId: input.serviceId, environmentId: input.environmentId }
  );
  return data.deployments.edges[0]?.node.status ?? null;
}

/**
 * Triggers a fresh deployment of the service's current source image. For a
 * service whose source is a moving tag (`:latest`), this re-pulls and ships the
 * newest build — the simplest "update to latest".
 */
export async function redeployService(input: {
  serviceId: string;
  environmentId: string;
}): Promise<void> {
  await graphql(
    `
      mutation Redeploy($serviceId: String!, $environmentId: String!) {
        serviceInstanceRedeploy(
          serviceId: $serviceId
          environmentId: $environmentId
        )
      }
    `,
    { serviceId: input.serviceId, environmentId: input.environmentId }
  );
}

/**
 * Repoints the service at a specific image (e.g. an immutable `:sha-…` tag for
 * a pinned, reversible rollout) and deploys it.
 */
export async function setServiceImage(input: {
  serviceId: string;
  environmentId: string;
  image: string;
}): Promise<void> {
  await graphql(
    `
      mutation SetImage(
        $serviceId: String!
        $environmentId: String!
        $input: ServiceInstanceUpdateInput!
      ) {
        serviceInstanceUpdate(
          serviceId: $serviceId
          environmentId: $environmentId
          input: $input
        )
      }
    `,
    {
      serviceId: input.serviceId,
      environmentId: input.environmentId,
      input: { source: { image: input.image } },
    }
  );
  await redeployService(input);
}

export async function deleteService(serviceId: string): Promise<void> {
  await graphql(
    `
      mutation ServiceDelete($id: String!) {
        serviceDelete(id: $id)
      }
    `,
    { id: serviceId }
  );
}
