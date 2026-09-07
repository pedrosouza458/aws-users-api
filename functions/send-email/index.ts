import { SQSEvent, SQSHandler } from "aws-lambda";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

const sesClient = new SESClient();

export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      const snsMessage = JSON.parse(record.body);

      const user = JSON.parse(snsMessage.Message);

      const sesCommand = new SendEmailCommand({
        Source: process.env.VERIFIED_SENDER_EMAIL,
        Destination: {
          ToAddresses: [user.email],
        },
        Message: {
          Subject: {
            Data: "Welcome to Users API",
            Charset: "UTF-8",
          },
          Body: {
            Text: {
              Data: `Hello ${user.name},\n\nYour account was created successfully.`,
              Charset: "UTF-8",
            },
          },
        },
      });
      await sesClient.send(sesCommand);
      console.log("E-mail send successfully!");
    } catch (error) {
      console.log("Failed to send e-mail: ", error);
      throw error;
    }
  }
};
