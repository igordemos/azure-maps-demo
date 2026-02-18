targetScope = 'resourceGroup'

@description('Environment name used to generate resource names.')
param environmentName string

@description('Azure region for resource deployment.')
param location string

@description('Microsoft Entra tenant ID for token acquisition.')
param azureTenantId string

@description('Microsoft Entra app registration client ID.')
param azureClientId string

@secure()
@description('Microsoft Entra app registration client secret.')
param azureClientSecret string

@description('Service principal object ID that needs Azure Maps Data Reader.')
param azureMapsDataReaderPrincipalId string

@description('Azure Maps OAuth scope used for client credentials flow.')
param azureMapsScope string = 'https://atlas.microsoft.com/.default'

var resourceToken = uniqueString(subscription().id, resourceGroup().id, location, environmentName)

var planName = toLower('asp-${environmentName}-${resourceToken}')
var webAppName = toLower('app-${environmentName}-${resourceToken}')
var logAnalyticsName = toLower('log-${environmentName}-${resourceToken}')
var appInsightsName = toLower('appi-${environmentName}-${resourceToken}')
var keyVaultName = toLower('kv-${environmentName}-${resourceToken}')
var identityName = toLower('id-${environmentName}-${resourceToken}')
var mapsAccountName = toLower('map-${environmentName}-${resourceToken}')
var mapsBaseUrl = 'https://atlas.microsoft.com'

module userIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.5.0' = {
  name: 'userIdentity'
  params: {
    name: identityName
    location: location
  }
}

module logAnalytics 'br/public:avm/res/operational-insights/workspace:0.15.0' = {
  name: 'logAnalytics'
  params: {
    name: logAnalyticsName
    location: location
    dataRetention: 30
    skuName: 'PerGB2018'
  }
}

module appInsights 'br/public:avm/res/insights/component:0.7.1' = {
  name: 'appInsights'
  params: {
    name: appInsightsName
    location: location
    workspaceResourceId: logAnalytics.outputs.resourceId
  }
}

module mapsAccount 'br/public:avm/res/maps/account:0.2.1' = {
  name: 'mapsAccount'
  params: {
    name: mapsAccountName
    location: location
    kind: 'Gen2'
    sku: 'G2'
    disableLocalAuth: false
    roleAssignments: [
      {
        principalId: azureMapsDataReaderPrincipalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: 'Azure Maps Data Reader'
      }
    ]
  }
}

var mapsAccountResourceId = resourceId('Microsoft.Maps/accounts', mapsAccountName)
var mapsAccountClientId = reference(mapsAccountResourceId, '2024-07-01-preview').properties.uniqueId
var mapsKeys = listKeys(mapsAccountResourceId, '2024-07-01-preview')

module keyVault 'br/public:avm/res/key-vault/vault:0.13.3' = {
  name: 'keyVault'
  params: {
    name: keyVaultName
    location: location
    enableRbacAuthorization: true
    roleAssignments: [
      {
        principalId: userIdentity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: 'Key Vault Secrets User'
      }
    ]
  }
}

module mapsKeySecret 'br/public:avm/res/key-vault/vault/secret:0.1.0' = {
  name: 'mapsKeySecret'
  params: {
    name: 'AZURE-MAPS-KEY'
    keyVaultName: keyVaultName
    value: mapsKeys.primaryKey
  }
}

module clientSecret 'br/public:avm/res/key-vault/vault/secret:0.1.0' = {
  name: 'clientSecret'
  params: {
    name: 'AZURE-CLIENT-SECRET'
    keyVaultName: keyVaultName
    value: azureClientSecret
  }
}

module appServicePlan 'br/public:avm/res/web/serverfarm:0.6.0' = {
  name: 'appServicePlan'
  params: {
    name: planName
    location: location
    kind: 'app'
    skuName: 'B1'
    skuCapacity: 1
  }
}

module webApp 'br/public:avm/res/web/site:0.21.0' = {
  name: 'webApp'
  params: {
    name: webAppName
    location: location
    kind: 'app'
    httpsOnly: true
    serverFarmResourceId: appServicePlan.outputs.resourceId
    managedIdentities: {
      userAssignedResourceIds: [
        userIdentity.outputs.resourceId
      ]
    }
    keyVaultAccessIdentityResourceId: userIdentity.outputs.resourceId
    tags: {
      'azd-service-name': 'maps-explorer'
    }
    configs: [
      {
        name: 'appsettings'
        properties: {
          SCM_DO_BUILD_DURING_DEPLOYMENT: 'true'
          WEBSITE_NODE_DEFAULT_VERSION: '~20'
          APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.outputs.connectionString
          APPINSIGHTS_INSTRUMENTATIONKEY: appInsights.outputs.instrumentationKey
          AZURE_TENANT_ID: azureTenantId
          AZURE_CLIENT_ID: azureClientId
          AZURE_CLIENT_SECRET: '@Microsoft.KeyVault(SecretUri=${clientSecret.outputs.secretUriWithVersion})'
          AZURE_MAPS_SCOPE: azureMapsScope
          AZURE_MAPS_CLIENT_ID: mapsAccountClientId
          AZURE_MAPS_BASE_URL: mapsBaseUrl
          NEXT_PUBLIC_AZURE_MAPS_BASE_URL: mapsBaseUrl
          AZURE_MAPS_KEY: '@Microsoft.KeyVault(SecretUri=${mapsKeySecret.outputs.secretUriWithVersion})'
        }
      }
    ]
  }
}

output RESOURCE_GROUP_ID string = resourceGroup().id
output WEB_APP_NAME string = webApp.outputs.name
output KEY_VAULT_NAME string = keyVault.outputs.name
output MAPS_ACCOUNT_NAME string = mapsAccount.outputs.name
