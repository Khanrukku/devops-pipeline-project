pipeline {
    agent any

    environment {
        AWS_REGION      = 'us-east-1'
        AWS_ACCOUNT_ID  = '111708096083'  // Replace with your 12-digit AWS Account ID
        ECR_REPO        = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/devops-pipeline-app"
        ECS_CLUSTER     = 'devops-pipeline-cluster'
        ECS_SERVICE     = 'devops-pipeline-service'
        TASK_DEFINITION = 'devops-pipeline-task'
        CONTAINER_NAME  = 'devops-pipeline-container'
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out code from GitHub...'
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo 'Building Docker image...'

                    def image = docker.build("${ECR_REPO}:${BUILD_NUMBER}")

                    sh "docker tag ${ECR_REPO}:${BUILD_NUMBER} ${ECR_REPO}:latest"

                    echo "Built image: ${ECR_REPO}:${BUILD_NUMBER}"
                }
            }
        }

        stage('Run Tests') {
            steps {
                echo 'Running application tests...'
                sh 'npm test'
            }
        }

        stage('Push to ECR') {
            steps {
                script {
                    echo 'Pushing image to Amazon ECR...'

                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPO}
                    """

                    sh "docker push ${ECR_REPO}:${BUILD_NUMBER}"
                    sh "docker push ${ECR_REPO}:latest"

                    echo 'Image pushed successfully!'
                }
            }
        }

        stage('Deploy to ECS') {
            steps {
                script {
                    echo 'Deploying to Amazon ECS...'

                    def taskDefArn = sh(
                        script: "aws ecs describe-task-definition --task-definition ${TASK_DEFINITION} --query 'taskDefinition.taskDefinitionArn' --output text --region ${AWS_REGION}",
                        returnStdout: true
                    ).trim()

                    echo "Current task definition: ${taskDefArn}"

                    sh """
                        aws ecs describe-task-definition --task-definition ${TASK_DEFINITION} --region ${AWS_REGION} --query 'taskDefinition' --output json > task-def.json

                        cat > update_task_def.py << 'EOF'
import json

with open('task-def.json', 'r') as f:
    task_def = json.load(f)

fields_to_remove = ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes',
                    'placementConstraints', 'compatibilities', 'registeredAt', 'registeredBy']
for field in fields_to_remove:
    task_def.pop(field, None)

for container in task_def['containerDefinitions']:
    if container['name'] == '${CONTAINER_NAME}':
        container['image'] = '${ECR_REPO}:${BUILD_NUMBER}'
        print(f"Updated container image to: {container['image']}")

with open('updated-task-def.json', 'w') as f:
    json.dump(task_def, f, indent=2)

print("Task definition updated successfully")
EOF

                        python3 update_task_def.py
                    """

                    def newTaskDef = sh(
                        script: """
                            aws ecs register-task-definition \
                                --cli-input-json file://updated-task-def.json \
                                --region ${AWS_REGION} \
                                --query 'taskDefinition.taskDefinitionArn' \
                                --output text
                        """,
                        returnStdout: true
                    ).trim()

                    echo "New task definition registered: ${newTaskDef}"

                    sh """
                        aws ecs update-service \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE} \
                            --task-definition ${newTaskDef} \
                            --region ${AWS_REGION}
                    """

                    echo "Service update initiated"
                }
            }
        }

        stage('Wait for Deployment') {
            steps {
                script {
                    echo 'Waiting for deployment to complete...'

                    sh """
                        echo "Waiting for service to become stable..."
                        aws ecs wait services-stable \
                            --cluster ${ECS_CLUSTER} \
                            --services ${ECS_SERVICE} \
                            --region ${AWS_REGION}
                    """

                    echo 'Deployment completed successfully!'
                }
            }
        }

        stage('Health Check & Get Public IP') {
            steps {
                script {
                    echo 'Getting public IP and performing health check...'

                    def taskArn = sh(
                        script: """
                            aws ecs list-tasks \
                                --cluster ${ECS_CLUSTER} \
                                --service-name ${ECS_SERVICE} \
                                --query 'taskArns[0]' \
                                --output text \
                                --region ${AWS_REGION}
                        """,
                        returnStdout: true
                    ).trim()

                    echo "Task ARN: ${taskArn}"

                    if (taskArn == "None" || taskArn == "") {
                        error("No running tasks found for service ${ECS_SERVICE}")
                    }

                    def networkInterfaceId = sh(
                        script: """
                            aws ecs describe-tasks \
                                --cluster ${ECS_CLUSTER} \
                                --tasks ${taskArn} \
                                --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' 
                                --output text \
                                --region ${AWS_REGION}
                        """,
                        returnStdout: true
                    ).trim()

                    echo "Network Interface ID: ${networkInterfaceId}"

                    if (networkInterfaceId == "None" || networkInterfaceId == "") {
                        error("Could not find network interface for task")
                    }

                    def publicIp = sh(
                        script: """
                            aws ec2 describe-network-interfaces \
                                --network-interface-ids ${networkInterfaceId} \
                                --query 'NetworkInterfaces[0].Association.PublicIp' \
                                --output text \
                                --region ${AWS_REGION}
                        """,
                        returnStdout: true
                    ).trim()

                    echo "🌐 Application Public IP: ${publicIp}"
                    echo "🔗 Application URL: http://${publicIp}:3000"
                    echo "💚 Health Check URL: http://${publicIp}:3000/health"

                    if (publicIp == "None" || publicIp == "") {
                        error("Could not retrieve public IP address")
                    }

                    echo "Waiting 60 seconds for container to fully start..."
                    sleep(60)

                    echo "Testing health endpoint..."
                    timeout(time: 5, unit: 'MINUTES') {
                        waitUntil {
                            script {
                                try {
                                    def response = sh(
                                        script: "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 30 http://${publicIp}:3000/health || echo '000'",
                                        returnStdout: true
                                    ).trim()

                                    echo "Health check response: ${response}"

                                    if (response == '200') {
                                        echo "✅ Health check passed!"
                                        return true
                                    } else {
                                        echo "⏳ Waiting for health check to pass..."
                                        return false
                                    }
                                } catch (Exception e) {
                                    echo "❌ Health check failed with exception: ${e.getMessage()}"
                                    return false
                                }
                            }
                        }
                    }

                    echo '✅ Health check passed! Application is running successfully.'
                    echo "🎉 Access your app at: http://${publicIp}:3000"
                    echo "🏥 Health check at: http://${publicIp}:3000/health"

                    env.APPLICATION_URL = "http://${publicIp}:3000"
                }
            }
        }
    }

    post {
        failure {
            script {
                echo '❌ Pipeline failed! Attempting rollback...'

                try {
                    def taskDefRevisions = sh(
                        script: """
                            aws ecs list-task-definitions \
                                --family-prefix ${TASK_DEFINITION} \
                                --status ACTIVE \
                                --sort DESC \
                                --query 'taskDefinitionArns[1]' \
                                --output text \
                                --region ${AWS_REGION}
                        """,
                        returnStdout: true
                    ).trim()

                    if (taskDefRevisions && taskDefRevisions != 'None' && taskDefRevisions != '') {
                        echo "🔄 Rolling back to previous version: ${taskDefRevisions}"

                        sh """
                            aws ecs update-service \
                                --cluster ${ECS_CLUSTER} \
                                --service ${ECS_SERVICE} \
                                --task-definition ${taskDefRevisions} \
                                --region ${AWS_REGION}
                        """

                        echo '✅ Rollback initiated successfully'
                    } else {
                        echo '⚠️  No previous deployment found for rollback'
                    }
                } catch (Exception e) {
                    echo "❌ Rollback failed: ${e.getMessage()}"
                }
            }
        }

        always {
            script {
                echo '🧹 Cleaning up Docker images...'
                try {
                    sh 'docker system prune -f'
                } catch (Exception e) {
                    echo "Warning: Docker cleanup failed: ${e.getMessage()}"
                }
            }
        }

        success {
            script {
                echo '🎉 Pipeline completed successfully!'
                echo '🚀 Your application is now live and running with zero downtime!'
                if (env.APPLICATION_URL) {
                    echo "🌐 Application is accessible at: ${env.APPLICATION_URL}"
                }
                echo '✨ DevOps CI/CD Pipeline is working perfectly!'
            }
        }
    }
}
