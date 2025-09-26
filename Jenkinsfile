pipeline {
    agent any
    
    environment {
        AWS_REGION = 'us-east-1'
        AWS_ACCOUNT_ID = '111708096083'
        ECR_REPO = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/devops-pipeline-app"
        ECS_CLUSTER = 'devops-pipeline-cluster'
        ECS_SERVICE = 'devops-pipeline-service'
        TASK_DEFINITION = 'devops-pipeline-task'
        CONTAINER_NAME = 'devops-pipeline-container'
    }
    
    stages {
        stage('Test Connection') {
            steps {
                echo 'Testing Jenkins pipeline...'
                echo "AWS Region: ${AWS_REGION}"
                echo "ECR Repo: ${ECR_REPO}"
                echo "ECS Cluster: ${ECS_CLUSTER}"
            }
        }
        
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
                    
                    // Simple deployment approach
                    sh """
                        aws ecs update-service \
                            --cluster ${ECS_CLUSTER} \
                            --service ${ECS_SERVICE} \
                            --force-new-deployment \
                            --region ${AWS_REGION}
                    """
                    
                    echo "Deployment initiated successfully"
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
        
        stage('Get Service Status') {
            steps {
                script {
                    echo 'Getting service status...'
                    
                    // Get service info
                    sh """
                        aws ecs describe-services \
                            --cluster ${ECS_CLUSTER} \
                            --services ${ECS_SERVICE} \
                            --region ${AWS_REGION}
                    """
                    
                    echo 'Service is running! Check ECS console for public IP.'
                }
            }
        }
    }
    
    post {
        success {
            echo '🎉 Pipeline completed successfully!'
            echo '🚀 Check your ECS service in AWS console for the public IP'
        }
        
        failure {
            echo '❌ Pipeline failed! Check the logs above.'
        }
        
        always {
            script {
                try {
                    sh 'docker system prune -f'
                } catch (Exception e) {
                    echo "Docker cleanup warning: ${e.getMessage()}"
                }
            }
        }
    }
}
