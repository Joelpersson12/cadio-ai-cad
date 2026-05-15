import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const config = new pulumi.Config();
const containerPort = config.getNumber("containerPort") || 8000;
const cpu = config.getNumber("cpu") || 256;
const memory = config.getNumber("memory") || 512;

// ---------------------------------------------------------------------------
// ECR repository + Docker image
// ---------------------------------------------------------------------------

const repo = new awsx.ecr.Repository("cadio-repo", {
  forceDelete: true,
});

const image = new awsx.ecr.Image("cadio-image", {
  repositoryUrl: repo.url,
  context: "..",
  dockerfile: "../Dockerfile",
  platform: "linux/amd64",
});

// ---------------------------------------------------------------------------
// S3: frontend static hosting
// ---------------------------------------------------------------------------

const frontendBucket = new aws.s3.BucketV2("cadio-frontend", {
  forceDestroy: true,
});

new aws.s3.BucketWebsiteConfigurationV2("cadio-frontend-website", {
  bucket: frontendBucket.id,
  indexDocument: { suffix: "index.html" },
  errorDocument: { key: "index.html" },
});

const frontendPublicAccess = new aws.s3.BucketPublicAccessBlock(
  "cadio-frontend-public",
  {
    bucket: frontendBucket.id,
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false,
  },
);

new aws.s3.BucketPolicy(
  "cadio-frontend-policy",
  {
    bucket: frontendBucket.id,
    policy: frontendBucket.arn.apply((arn) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `${arn}/*`,
          },
        ],
      }),
    ),
  },
  { dependsOn: [frontendPublicAccess] },
);

// ---------------------------------------------------------------------------
// S3: STL export storage (auto-expire after 7 days)
// ---------------------------------------------------------------------------

const exportsBucket = new aws.s3.BucketV2("cadio-exports", {
  forceDestroy: true,
});

new aws.s3.BucketLifecycleConfigurationV2("cadio-exports-lifecycle", {
  bucket: exportsBucket.id,
  rules: [
    {
      id: "expire-exports",
      status: "Enabled",
      expiration: { days: 7 },
    },
  ],
});

// ---------------------------------------------------------------------------
// ALB (must be defined before the Fargate service)
// ---------------------------------------------------------------------------

const lb = new awsx.lb.ApplicationLoadBalancer("cadio-lb", {
  defaultTargetGroup: {
    port: containerPort,
    protocol: "HTTP",
    healthCheck: {
      path: "/api/health",
      interval: 30,
      timeout: 5,
      healthyThreshold: 2,
      unhealthyThreshold: 3,
    },
  },
});

// ---------------------------------------------------------------------------
// ECS Fargate service
// ---------------------------------------------------------------------------

const cluster = new aws.ecs.Cluster("cadio-cluster");

new awsx.ecs.FargateService("cadio-api", {
  cluster: cluster.arn,
  desiredCount: 1,
  assignPublicIp: true,
  taskDefinitionArgs: {
    container: {
      name: "cadio-api",
      image: image.imageUri,
      cpu,
      memory,
      essential: true,
      portMappings: [
        {
          containerPort,
          targetGroup: lb.defaultTargetGroup,
        },
      ],
      environment: [
        { name: "PORT", value: String(containerPort) },
        { name: "EXPORTS_BUCKET", value: exportsBucket.bucket },
      ],
    },
  },
});

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export const backendUrl = lb.loadBalancer.dnsName.apply(
  (dns) => `http://${dns}`,
);
export const frontendBucketName = frontendBucket.bucket;
export const ecrRepositoryUrl = repo.url;
export const exportsBucketName = exportsBucket.bucket;
