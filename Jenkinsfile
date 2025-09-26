pipeline {
    agent any
    
    environment {
        AWS_REGION      = 'us-east-1'
        AWS_ACCOUNT_ID  = '111708096083'
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
                        aws ecr get-login-password --region ${AWS_REGION} \
                        | docker login --username AWS --password-stdin ${ECR_REPO}
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
                    
                    def newTaskDef = sh(
                        script: """
                            aws ecs describe-task-definition --task-definition ${TASK_DEFINITION} --region ${AWS_REGION} \
                                --query 'taskDefinition' \
                                --output json > task-def.json
                            
                            python3 -c "
import json
with open('task-def.json', 'r') as f:
    task_def = json.load(f)

for key in ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'placementConstraints', 'compatibilities', 'registeredAt', 'registeredBy']:
    task_def.pop(key, None)

for container in task_def['containerDefinitions']:
    if container['name'] == '${CONTAINER_NAME}':
        container['image'] = '${ECR_REPO}:${BUILD_NUMBER}'

with open('updated-task-def.json', 'w') as f:
    json.dump(task_def, f, indent=2)
"
                            
                            aws ecs register-task-definition \
                                --cli-input-json file://updated-task-def.json \
                                --region ${AWS_REGION} \
                                --query 'taskDefinition.taskDefinitionArn' \
                                --output text
                        """,
                        returnStdout: true
                    ).trim()
                    
                    echo "New task definition: ${newTaskDef}"
                    
                    sh """
                        aws ecs update-service \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE} \
                            --task-definition ${newTaskDef} \
                            --region ${AWS_REGION}
                    """
                }
            }
        }
        
        stage('Wait for Deployment') {
            steps {
                script {
                    echo 'Waiting for deployment to complete...'
                    
                    sh """
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
                    
                    def networkInterfaceId = sh(
                        script: """
                            aws ecs describe-tasks \
                                --cluster ${ECS_CLUSTER} \
                                --tasks ${taskArn} \
                                --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
                                --output text \
                                --region ${AWS_REGION}
                        """,
                        returnStdout: true
                    ).trim()
                    
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
                    
                    sleep(30)
                    
                    timeout(time: 5, unit: 'MINUTES') {
                        waitUntil {
                            script {
                                def response = sh(
                                    script: "curl -s -o /dev/null -w '%{http_code}' http://${publicIp}:3000/health || echo '000'",
                                    returnStdout: true
                                ).trim()
                                
                                echo "Health check response: ${response}"
                                return response == '200'
                            }
                        }
                    }
                    
                    echo '✅ Health check passed! Application is running successfully.'
                    echo "🎉 Access your app at: http://${publicIp}:3000"
                }
            }
        }
    }
    
    post {
        failure {
            script {
                echo 'Pipeline failed! Attempting rollback...'
                
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
                
                if (taskDefRevisions && taskDefRevisions != 'None') {
                    echo "Rolling back to: ${taskDefRevisions}"
                    
                    sh """
                        aws ecs update-service \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE} \
                            --task-definition ${taskDefRevisions} \
                            --region ${AWS_REGION}
                    """
                    
                    echo 'Rollback initiated.'
                } else {
                    echo 'No previous deployment found for rollback.'
                }
            }
        }
        
        always {
            echo 'Cleaning up Docker images...'
            sh 'docker system prune -f'
        }
        
        success {
            script {
                echo '🎉 Pipeline completed successfully!'
                echo '🚀 Your application is now live and running with zero downtime!'
                echo '💡 The pipeline will show you the public IP address to access your app'
            }
        }
    }
}
