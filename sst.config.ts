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
      fields: {pk: "string", sk: "string"},
      primaryIndex: {hashKey: "pk", rangeKey: "sk"},
    });

    // 2. Auth: User Pool
    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      mfa: "off",
      usernames: ["email"],
    });

    // 2a. Auth: Google Identity Provider (Raw AWS Resource)
    const googleProvider = new aws.cognito.IdentityProvider("GoogleProvider", {
      userPoolId: userPool.id,
      providerName: "Google",
      providerType: "Google",
      providerDetails: {
        client_id: new sst.Secret("GOOGLE_CLIENT_ID").value,
        client_secret: new sst.Secret("GOOGLE_CLIENT_SECRET").value,
        authorize_scopes: "email profile openid",
      },
      attributeMapping: {
        email: "email",
        given_name: "given_name",
        family_name: "family_name",
        picture: "picture",
      },
    });

    // 2b. Auth: User Pool Client (Raw AWS Resource)
    // We use this instead of userPool.addClient to ensure we can use 'dependsOn'
    const client = new aws.cognito.UserPoolClient("WebClient", {
      userPoolId: userPool.id,

      // Setup callbacks
      callbackUrls: ["http://localhost:5173"],
      logoutUrls: ["http://localhost:5173"],

      // Link Providers
      supportedIdentityProviders: ["COGNITO", "Google"],

      // OAuth Flows
      allowedOauthFlows: ["code"],
      allowedOauthScopes: ["email", "profile", "openid"],
      allowedOauthFlowsUserPoolClient: true,
    }, {dependsOn: [googleProvider]}); // <--- EXPLICIT DEPENDENCY HERE

    // 2c. Auth: Domain
    const domain = new aws.cognito.UserPoolDomain("AuthDomain", {
      userPoolId: userPool.id,
      domain: `flight-ai-${$app.stage}`,
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
        MY_PHONE_NUMBER: process.env.MY_PHONE_NUMBER!,
      },
      permissions: [{actions: ["scheduler:*", "ses:*"], resources: ["*"]}],
      transform: {
        role: (args) => {
          // Ensure the AssumeRolePolicyDocument allows both Lambda and Scheduler
          args.assumeRolePolicy = {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: {
                  Service: [
                    "lambda.amazonaws.com",
                    "scheduler.amazonaws.com"
                  ],
                },
                Action: "sts:AssumeRole",
              },
            ],
          };
        },
      },
    });

    const api = new sst.aws.ApiGatewayV2("Api", {
      cors: {
        allowMethods: ["GET", "POST", "OPTIONS", "PUT"],
        allowOrigins: ["http://localhost:5173"],
        allowHeaders: ["Authorization", "Content-Type"],
      },
      transform: {
        route: {
          handler: {
            link: [table, notifyWorker],
            environment: {
              WORKER_ARN: notifyWorker.arn,
              SCHEDULER_ROLE_ARN: notifyWorker.nodes.role.arn,
              AVIATION_STACK_KEY: process.env.AVIATION_STACK_KEY!,
              TWILIO_SID: process.env.TWILIO_SID!,
              TWILIO_TOKEN: process.env.TWILIO_TOKEN!,
              TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER!,
            },
          }
        }
      }
    });


    // Create a JWT Authorizer linked to your User Pool
    const authorizer = api.addAuthorizer({
      name: "UserPoolAuthorizer",
      jwt: {
        // Ensure this string matches the token 'iss' EXACTLY
        issuer: $interpolate`https://cognito-idp.${aws.getRegionOutput().name}.amazonaws.com/${userPool.id}`,
        // Ensure this matches the token 'aud' EXACTLY
        audiences: [client.id],
      },
    });

    // Secure the routes with this authorizer
    api.route("POST /trips", {
      handler: "packages/functions/src/trip.create",
      authorizer: authorizer.id,
      link: [table],
      permissions: [
        {actions: ["scheduler:*", "iam:PassRole"], resources: ["*"]}
      ],
    });

    api.route("GET /trips", {
      handler: "packages/functions/src/trip.list",
      link: [table],
      permissions: [
        {actions: ["scheduler:*", "iam:PassRole"], resources: ["*"]}
      ],
      auth: {
        jwt: {
          authorizer: authorizer.id,
        }
      }
    });

// Flight Search Route - using same auth pattern
    api.route("GET /flights/search", {
      handler: "packages/functions/src/flight.search",
      auth: {
        jwt: {
          authorizer: authorizer.id,
        }
      }
    });

// Profile Routes - same pattern
    api.route("GET /profile", {
      handler: "packages/functions/src/profile.get",
      auth: {
        jwt: {
          authorizer: authorizer.id,
        }
      }
    });

    api.route("PUT /profile", {
      handler: "packages/functions/src/profile.update",
      auth: {
        jwt: {
          authorizer: authorizer.id,
        }
      }
    });

    api.route("POST /profile/verify/send", {
      handler: "packages/functions/src/profile.sendVerification",
      auth: {
        jwt: {
          authorizer: authorizer.id,
        }
      }
    });

    api.route("POST /profile/verify/confirm", {
      handler: "packages/functions/src/profile.confirmVerification",
      auth: {
        jwt: {
          authorizer: authorizer.id,
        }
      }
    });



    return {
      ApiEndpoint: api.url,
      Region: aws.getRegionOutput().name,
      UserPoolId: userPool.id,
      UserPoolClientId: client.id,
      AuthDomainPrefix: domain.domain,
      AuthDomain: $interpolate`https://${domain.domain}.auth.${aws.getRegionOutput().name}.amazoncognito.com`,
    };
  },
});
