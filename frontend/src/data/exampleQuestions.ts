import type { ExampleQuestion } from '../types';

export const exampleQuestions: ExampleQuestion[] = [
  // Getting Started
  { id: '1', question: "What is the Cloud Infrastructure Community Program (CICP)?", category: "Getting Started" },
  { id: '2', question: "How do I join the NET+ AWS program?", category: "Getting Started" },
  { id: '3', question: "How do I join the NET+ GCP program?", category: "Getting Started" },
  { id: '4', question: "What are the benefits of CICP membership?", category: "Getting Started" },
  { id: '5', question: "Who can participate in the CICP program?", category: "Getting Started" },

  // AWS
  { id: '6', question: "What workloads can I run on AWS?", category: "AWS" },
  { id: '7', question: "What are AWS best practices for higher education?", category: "AWS" },
  { id: '8', question: "What is AWS Control Tower and how do I set it up for higher ed?", category: "AWS" },
  { id: '9', question: "How should I structure my AWS account organization?", category: "AWS" },
  { id: '10', question: "What is AWS Omics and how is it used in research?", category: "AWS" },

  // GCP
  { id: '11', question: "What workloads can I run on GCP?", category: "GCP" },
  { id: '12', question: "What are GCP best practices for higher education?", category: "GCP" },
  { id: '13', question: "How do I set up GCP organization structure for a university?", category: "GCP" },
  { id: '14', question: "What GCP services are popular in research computing?", category: "GCP" },

  // Multi-Cloud
  { id: '15', question: "How do institutions manage multi-cloud environments?", category: "Multi-Cloud" },
  { id: '16', question: "What are the trade-offs between AWS, GCP, and Azure?", category: "Multi-Cloud" },
  { id: '17', question: "Do I have to set up a cloud networking architecture for each platform or is there a single strategy to rule them all?", category: "Multi-Cloud" },

  // FinOps
  { id: '18', question: "How do I convince my leadership of the importance of FinOps practices?", category: "FinOps" },
  { id: '19', question: "What are cloud cost optimization strategies for higher ed?", category: "FinOps" },
  { id: '20', question: "How do institutions track and allocate cloud costs?", category: "FinOps" },
  { id: '21', question: "What tools do universities use for cloud cost management?", category: "FinOps" },

  // Governance
  { id: '22', question: "Who has a Cloud Center of Excellence?", category: "Governance" },
  { id: '23', question: "How are people doing account provisioning?", category: "Governance" },
  { id: '24', question: "What governance models work for university cloud adoption?", category: "Governance" },
  { id: '25', question: "How do institutions handle compliance and data residency?", category: "Governance" },

  // Community & Events
  { id: '26', question: "What are Strategic Calls and how do I join?", category: "Community" },
  { id: '27', question: "What happens at Tech Jams?", category: "Community" },
  { id: '28', question: "What is a Barn Raising event?", category: "Community" },
  { id: '29', question: "How do I access past event recordings?", category: "Community" },

  // Security
  { id: '30', question: "What are cloud security best practices for universities?", category: "Security" },
  { id: '31', question: "How do institutions handle FERPA compliance in the cloud?", category: "Security" },
  { id: '32', question: "What are research data security requirements?", category: "Security" },

  // Research Computing
  { id: '33', question: "How is cloud used for research computing?", category: "Research" },
  { id: '34', question: "What are high-performance computing (HPC) options on AWS/GCP?", category: "Research" },
  { id: '35', question: "How do researchers access cloud resources?", category: "Research" },
];

export const featuredQuestions = exampleQuestions.slice(0, 6);