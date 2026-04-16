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

export async function addCustomDomain(input: {
  serviceId: string;
  environmentId: string;
  domain: string;
}): Promise<{ defaultDomain: string }> {
  const data = await graphql<{
    customDomainCreate: { id: string; domain: string };
  }>(
    `
      mutation CustomDomainCreate($input: CustomDomainCreateInput!) {
        customDomainCreate(input: $input) {
          id
          domain
        }
      }
    `,
    {
      input: {
        environmentId: input.environmentId,
        serviceId: input.serviceId,
        domain: input.domain,
      },
    }
  );

  return { defaultDomain: data.customDomainCreate.domain };
}

export async function pauseService(serviceId: string): Promise<void> {
  await graphql(
    `
      mutation ServiceInstanceUpdate($input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(input: $input)
      }
    `,
    {
      input: {
        serviceId,
        // Scales the service to 0 replicas. Resume by setting back to 1.
        numReplicas: 0,
      },
    }
  );
}
