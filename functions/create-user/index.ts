import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "node:crypto";

const client = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client();
const snsClient = new SNSClient();

type CreateUserRequest = {
  name: string;
  email: string;
  fileName?: string;
  age?: number;
  location?: string;
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing request body" }),
      };
    }

    const body: CreateUserRequest = JSON.parse(event.body!);

    if (!body.name || !body.email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Name and email are required fields" }),
      };
    }

    const userId = randomUUID();

    let uploadUrl = null;
    let photoUrl = null;

    if (body.fileName) {
      const photoKey = `profiles/${userId}-${body.fileName}`;
      const s3Command = new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: photoKey,
      });

      uploadUrl = await getSignedUrl(s3Client, s3Command, { expiresIn: 300 });
      photoUrl = `https://${process.env.BUCKET_NAME}.s3.amazonaws.com/${photoKey}`;
    }

    const user = {
      id: userId,
      name: body.name,
      email: body.email,
      photoUrl,
      age: body.age,
      location: body.location,
      created_at: new Date().toISOString(),
      type: "user",
    };

    const command = new PutCommand({
      TableName: process.env.TABLE_NAME || "DynamoTable",
      Item: user,
    });

    await docClient.send(command);

    if (process.env.SNS_TOPIC_ARN) {
      const snsCommand = new PublishCommand({
        TopicArn: process.env.SNS_TOPIC_ARN,
        Message: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: user.name,
        }),
        Subject: "UserCreatedEvent",
      });
      await snsClient.send(snsCommand);
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Use the uploadUrl to upload your picture.",
        user,
        uploadUrl,
      }),
    };
  } catch (error: any) {
    console.error("Error creating user:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
        error: error.message,
      }),
    };
  }
};
