/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "flight-ai",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // 1. Database
    const table = new sst.aws.Dynamo("Table", {
      fields: {
        pk: "string",
        sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    });

    // 2. Auth (CORRECTED COMPONENT NAME)
    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      // Optional: Add triggers or other settings here if needed
      // For simple email/password or social login, defaults are often enough
    });

    // Add a client for your React App
    const client = userPool.addClient("WebClient", {
      transform: {
        client: {
          callbackUrls: ["http://localhost:5173"],
          logoutUrls: ["http://localhost:5173"],
        }
      }
    });

    // 3. Worker
    const notifyWorker = new sst.aws.Function("NotifyWorker", {
      handler: "packages/functions/src/notify.handler",
      link: [table],
      environment: {
        GOOGLE_MAPS_KEY: process.env.GOOGLE_MAPS_KEY!,
        TWILIO_SID: process.env.TWILIO_SID!,
        TWILIO_TOKEN: process.env.TWILIO_TOKEN!,
        TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER!,
      },
      permissions: [
        {
          actions: ["scheduler:*", "ses:*"],
          resources: ["*"],
        },
      ],
    });

    // 4. API Gateway
    const api = new sst.aws.ApiGatewayV2("Api");

    api.route("POST /trips", {
      handler: "packages/functions/src/trip.create",
      link: [table, notifyWorker],
      permissions: [
        {
          actions: ["scheduler:*", "iam:PassRole"],
          resources: ["*"],
        },
      ],
      environment: {
        WORKER_ARN: notifyWorker.arn,
        SCHEDULER_ROLE_ARN: notifyWorker.nodes.role.arn,
      },
    });

    api.route("GET /trips", {
      handler: "packages/functions/src/trip.list",
      link: [table],
    });

    return {
      ApiEndpoint: api.url,
      Region: aws.getRegionOutput().name,
      UserPoolId: userPool.id,
      UserPoolClientId: client.id, // Access the client ID from the client object
    };
  },
});
