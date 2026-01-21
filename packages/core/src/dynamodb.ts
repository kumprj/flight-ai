import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst"; // <--- Important for SST v3
import { GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const Database = {
  put: async (item: any) => {
    await docClient.send(new PutCommand({
      TableName: Resource.Table.name, // Access the linked table name
      Item: item,
    }));
  },

  listTrips: async (userId: string) => {
    const result = await docClient.send(new QueryCommand({
      TableName: Resource.Table.name,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk": "TRIP#",
      },
    }));
    return result.Items;
  },
  getProfile: async (userId: string) => {
    const result = await docClient.send(new GetCommand({
      TableName: Resource.Table.name,
      Key: {
        pk: `USER#${userId}`,
        sk: "PROFILE"
      }
    }));
    return result.Item;
  }
};
