import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { post } from 'axios';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

const secretsClient = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentialDefaultProvider: defaultProvider
});

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function getSecret(secretName) {
    try {
        const response = await secretsClient.send(
            new GetSecretValueCommand({ SecretId: secretName })
        );
        return JSON.parse(response.SecretString);
    } catch (error) {
        console.error(`Error retrieving secret ${secretName}:`, error);
        throw error;
    }
}

async function updateSecret(secretName, secretValue) {
    try {
        await secretsClient.send(
            new UpdateSecretCommand({
                SecretId: secretName,
                SecretString: JSON.stringify(secretValue)
            })
        );
        console.log(`Secret ${secretName} updated successfully`);
    } catch (error) {
        console.error(`Error updating secret ${secretName}:`, error);
        throw error;
    }
}

async function fetchTokenWithRetry(tokenUrl, authConfig) {
    let attempt = 0;
    
    while (attempt < MAX_RETRIES) {
        try {
            const response = await post(tokenUrl, {}, {
                auth: {
                    username: authConfig.username,
                    password: authConfig.password
                },
                timeout: 5000
            });
            
            return response.data.access_token;
        } catch (error) {
            if (error.response && error.response.status >= 500 && error.response.status < 600) {
                attempt++;
                console.log(`Retry attempt ${attempt} after ${RETRY_DELAY}ms`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                continue;
            }
            throw new Error(`Token fetch failed: ${error.message}`);
        }
    }
    
    throw new Error(`Max retries (${MAX_RETRIES}) exceeded`);
}

export async function handler(event) {
    try {
        // Retrieve configuration from source secret
        const sourceSecret = await getSecret(process.env.SOURCE_SECRET_NAME);
        
        // Fetch new token with retry logic
        const newToken = await fetchTokenWithRetry(
            sourceSecret.TOKEN_URL,
            {
                username: sourceSecret.CLIENT_ID,
                password: sourceSecret.CLIENT_SECRET
            }
        );
        
        // Update target secret
        await updateSecret(process.env.TARGET_SECRET_NAME, {
            API_TOKEN: newToken,
            UPDATED_AT: new Date().toISOString()
        });
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Token rotated successfully' })
        };
    } catch (error) {
        console.error('Error in token rotation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message })
        };
    }
}