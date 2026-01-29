targetScope = 'resourceGroup'

@description('Environment name used to generate resource names.')
param environmentName string

@description('Azure region for resource deployment.')
param location string

var resourceToken = uniqueString(subscription().id, resourceGroup().id, location, environmentName)

var planName = toLower('asp-${environmentName}-${resourceToken}')
var webAppName = toLower('app-${environmentName}-${resourceToken}')
var logAnalyticsName = toLower('log-${environmentName}-${resourceToken}')
var appInsightsName = toLower('appi-${environmentName}-${resourceToken}')
var keyVaultName = toLower('kv-${environmentName}-${resourceToken}')
var identityName = toLower('id-${environmentName}-${resourceToken}')
var mapsAccountName = toLower('map-${environmentName}-${resourceToken}')
var mapsBaseUrl = 'https://atlas.microsoft.com'

resource userIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource mapsAccount 'Microsoft.Maps/accounts@2023-06-01' = {
  name: mapsAccountName
  location: location
  kind: 'Gen2'
  sku: {
    name: 'G2'
  }
  properties: {
    disableLocalAuth: false
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    sku: {
      name: 'standard'
      family: 'A'
    }
  }
}

resource mapsKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'AZURE-MAPS-KEY'
  properties: {
    value: mapsAccount.listKeys().primaryKey
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  kind: 'app'
  sku: {
    name: 'B1'
    tier: 'Basic'
    size: 'B1'
    capacity: 1
  }
}

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: webAppName
  location: location
  kind: 'app'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userIdentity.id}': {}
    }
  }
  tags: {
    'azd-service-name': 'maps-explorer'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      keyVaultReferenceIdentity: userIdentity.id
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'AZURE_MAPS_BASE_URL'
          value: mapsBaseUrl
        }
        {
          name: 'NEXT_PUBLIC_AZURE_MAPS_BASE_URL'
          value: mapsBaseUrl
        }
        {
          name: 'AZURE_MAPS_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${mapsKeySecret.properties.secretUriWithVersion})'
        }
      ]
    }
  }
}

resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, userIdentity.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
    principalId: userIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output RESOURCE_GROUP_ID string = resourceGroup().id
output WEB_APP_NAME string = webAppName
output KEY_VAULT_NAME string = keyVaultName
output MAPS_ACCOUNT_NAME string = mapsAccountName
