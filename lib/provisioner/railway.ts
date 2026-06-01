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
