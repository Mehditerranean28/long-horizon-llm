import json


clusters = [
    {
        "society": [
            {
                "name": "Baseline Society",
                "description": "Handles primary functionalities for each society to identify risks, plan, execute, etc.",
                "roles": [
                    "Selector",
                    "Negative Thinker",
                    "Critic",
                    "Synthesizer",
                    "Planner",
                    "Self-Examiner",
                    "Self-Repair Agent",
                ],
            },
        ],
        "kline": [
            {
                "name": "Baseline K-Line",
                "description": "Handles conflict resolution, consensus building, and mediation across societies.",
                "roles": [
                    "Conflict Mediator",
                    "Papert's Mediator",
                    "Difference Engine",
                    "Ambiguity Negotiator",
                ],
            },
        ],
    }
]

proto_brains = [
    {
        "role": "Negative Thinker",
        "strategy": "Negative Thinking: Worst-case scenario planning and antigoal comparison",
        "goal": "Imagine worst-case scenarios to explore adjacent or derivative problems or issues.",
        "output_attributes": {
            "worst_case_scenarios": "Comprehensive list of the possible worst-case scenarios for current issues, highlighting how situations could deteriorate further and their cascading implications.",
            "alternative_solution": "Proposed solutions arising from the analysis of worst-case scenarios, focusing on building resilience and avoiding potential pitfalls.",
            "antigoals": "A detailed list of actions or decisions to avoid, representing what not to do in order to prevent the realization of worst-case scenarios. Each antigoal is contextualized and linked to the current problem for clarity.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Addressing cybersecurity risks for a financial institution.",
                        "worst_case_scenarios": [
                            "A sophisticated ransomware attack encrypts all client data, halting operations for weeks and causing irreparable reputational damage.",
                            "Internal employees unintentionally expose sensitive client information through phishing scams, resulting in legal action and regulatory fines.",
                            "An undetected malware siphons funds from client accounts, leading to a massive financial loss.",
                        ],
                        "alternative_solution": [
                            "Implement a multi-layered security strategy that includes real-time intrusion detection, regular security audits, and employee training programs on phishing awareness.",
                            "Leverage AI to monitor network traffic for anomalies and deploy rapid-response protocols to mitigate attacks.",
                            "Conduct penetration testing to identify vulnerabilities and patch critical systems before exploitation.",
                        ],
                        "antigoals": [
                            "Ignoring software updates, leaving the system vulnerable to known exploits.",
                            "Underestimating employee training, leading to repeated human errors.",
                            "Assuming regulatory compliance equals complete security, resulting in blind spots in real-world defenses.",
                        ],
                    },
                    {
                        "case": "Planning disaster management for a coastal city facing climate change.",
                        "worst_case_scenarios": [
                            "A category-five hurricane directly hits the city, overwhelming evacuation routes and causing widespread flooding.",
                            "Rising sea levels inundate key infrastructure, such as hospitals and power plants, leading to prolonged blackouts and loss of life.",
                            "Supply chain disruptions leave residents without access to food, water, and medical supplies for weeks.",
                        ],
                        "alternative_solution": [
                            "Develop resilient urban planning policies, including the construction of flood barriers and elevated critical infrastructure.",
                            "Create decentralized emergency hubs stocked with essential supplies to reduce reliance on centralized logistics.",
                            "Use predictive climate models to inform policy and coordinate with regional governments for mutual aid agreements.",
                        ],
                        "antigoals": [
                            "Neglecting proactive infrastructure upgrades, resulting in unpreparedness for extreme weather events.",
                            "Over-reliance on centralized logistics systems that are vulnerable to single points of failure.",
                            "Ignoring early warning systems, leading to delayed evacuations and increased casualties.",
                        ],
                    },
                ],
                "bad_examples": [
                    {
                        "case": "Evaluating risks for a retail expansion.",
                        "worst_case_scenarios": [
                            "The new location might not perform as expected.",
                            "Inventory management might be difficult initially.",
                        ],
                        "alternative_solution": [
                            "Delay expansion to gather more market research."
                        ],
                        "antigoals": ["Expand without detailed analysis."],
                        "description_for_improvement": (
                            "The worst-case scenarios lack depth and fail to explore adjacent or derivative risks, such as competitor reactions, "
                            "economic downturns, or logistical challenges. Antigoals should highlight critical missteps linked to these expanded risks, "
                            "and alternative solutions must address broader systemic vulnerabilities."
                        ),
                    },
                    {
                        "case": "Improving customer service in an e-commerce platform.",
                        "worst_case_scenarios": [
                            "Customers might not like the new chatbot interface."
                        ],
                        "alternative_solution": ["Revert to the previous system."],
                        "antigoals": ["Ignore user feedback."],
                        "description_for_improvement": (
                            "The scenario is overly simplistic and fails to contextualize potential consequences of poor customer service, "
                            "such as reduced loyalty, negative reviews, or lost revenue. A robust exploration would include interdependencies with logistics, "
                            "customer retention strategies, and competitor benchmarking."
                        ),
                    },
                ],
            },
        },
        "metadata": {
            "explanatory_focus": (
                "Negative Thinker leverages comprehensive worst-case analysis and antigoal identification to foster strategic foresight. "
                "By exploring adjacent risks and derivative issues, it enables a nuanced understanding of potential pitfalls and opportunities for resilience."
            ),
        },
    },
    {
        "role": "Critic",
        "strategy": "Self-Examination: Reformulation and cross-realm translation",
        "goal": "Evaluate and identify problems in proposed solutions, fostering clarity and uncovering opportunities for refinement.",
        "output_attributes": {
            "problem_description": "Comprehensive critique of the proposed solution, focusing on inconsistencies, ambiguities, and structural flaws.",
            "alternative_suggestions": "Actionable, well-justified suggestions for improvement, grounded in evidence or relevant analogies.",
            "clarity_feedback": "Detailed explanation of areas where clarity is lacking, along with actionable recommendations for improvement.",
            "needs_follow_up": "Specific aspects requiring further exploration or refinement, including unresolved ambiguities or overlooked implications.",
            "expected_result": "Enhanced clarity, consistency, and feasibility of solutions through iterative critique and refinement.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Evaluating a proposal for an urban development project.",
                        "problem_description": (
                            "The proposal lacks a clear environmental impact assessment and overlooks community engagement strategies. "
                            "Additionally, the projected budget is inconsistent with similar projects in the region."
                        ),
                        "alternative_suggestions": [
                            "Conduct a comprehensive environmental impact study to identify potential risks and mitigation strategies.",
                            "Engage with local community leaders to align the project with community needs and priorities.",
                            "Revise the budget using benchmarks from comparable projects to ensure accuracy.",
                        ],
                        "clarity_feedback": (
                            "Break down the timeline into specific phases with clear deliverables for each stage. "
                            "Include a detailed explanation of funding sources and allocation."
                        ),
                        "needs_follow_up": (
                            "Verify the feasibility of the revised budget with external auditors and assess community sentiment through surveys."
                        ),
                    },
                    {
                        "case": "Analyzing a new software development methodology.",
                        "problem_description": (
                            "The methodology lacks clear metrics for tracking progress and does not address team collaboration in distributed environments."
                        ),
                        "alternative_suggestions": [
                            "Define key performance indicators (KPIs) to track project milestones and deliverables.",
                            "Incorporate tools and practices specifically designed for remote team collaboration, such as asynchronous communication protocols.",
                        ],
                        "clarity_feedback": "Provide a detailed explanation of how the methodology scales across teams of varying sizes.",
                        "needs_follow_up": "Evaluate the proposed KPIs with a pilot project to ensure their relevance and adaptability.",
                    },
                ],
                "bad_examples": [
                    {
                        "case": "Reviewing a marketing strategy document.",
                        "problem_description": "The strategy feels 'uninspired.'",
                        "alternative_suggestions": "Make it more dynamic.",
                        "clarity_feedback": "It's clear enough.",
                        "needs_follow_up": "No additional investigation needed.",
                        "description_for_improvement": (
                            "This example lacks specificity and actionable insights. The critique should focus on measurable aspects, such as target audience alignment, message consistency, or ROI expectations. "
                            "Alternative suggestions should include specific tactics, like revising messaging tone or targeting alternative demographics."
                        ),
                    },
                    {
                        "case": "Assessing a team structure reorganization plan.",
                        "problem_description": "The plan may not work.",
                        "alternative_suggestions": "Consider other options.",
                        "clarity_feedback": "It's clear why this plan was chosen.",
                        "needs_follow_up": "None.",
                        "description_for_improvement": (
                            "The critique lacks depth. It should address specific risks, such as unclear role definitions or potential bottlenecks. "
                            "Follow-up actions should include testing the reorganization through simulations or pilot implementations."
                        ),
                    },
                ],
            },
        },
        "metadata": {
            "explanatory_focus": (
                "Critic serves as a foundational role, identifying gaps, flaws, and ambiguities in proposed solutions. "
                "Its output drives refinement and alignment with broader objectives by engaging other roles, such as Selector and Synthesizer."
            )
        },
    },
    {
        "role": "Conflict Mediator",
        "strategy": "Non-Compromise: Resolving conflicts through competition or mediation",
        "goal": "Oversee and resolve disputes within or between agents.",
        "output_attributes": {
            "conflict_description": "Narrative detailing the conflict or dispute, including underlying causes and involved parties.",
            "resolution_strategy": "Chosen approach for resolving the conflict, with an explanation of why it was selected.",
            "resolution_outcome": "Outcome of the mediation or resolution process, including remaining tensions or follow-up actions.",
            "escalation_reasoning": "Explanation of why escalation is or isn't required and suggestions for higher-level intervention if needed.",
        },
        "metadata": {
            "explanatory_focus": "Mediator ensures that conflicts are resolved constructively to maintain collaboration.",
        },
    },
    {
        "role": "Selector",
        "strategy": "Adaptive Strategies: Using imperfect but reliable methods",
        "goal": "Activate and apply the most suitable strategies.",
        "output_attributes": {
            "selected_strategy": "Name of the chosen strategy along with its theoretical or practical justification.",
            "reasoning": "Explanation of why this strategy was selected, highlighting its relevance to the problem.",
            "evaluation_criteria": "Details of the criteria used to evaluate and select the strategy, including trade-offs considered.",
            "action_plan": "Steps for implementing the selected strategy and ensuring its alignment with overarching goals.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Optimizing logistics in a global supply chain.",
                        "selected_strategy": "Adopt a dynamic inventory management system using just-in-time principles.",
                        "reasoning": (
                            "The strategy minimizes holding costs while ensuring adequate supply levels by leveraging real-time data integration from suppliers and distributors. "
                            "This aligns with the organizational goal of cost efficiency while maintaining responsiveness."
                        ),
                        "evaluation_criteria": [
                            "Ability to scale across multiple regions.",
                            "Compatibility with existing IT infrastructure.",
                            "Impact on lead time and customer satisfaction metrics.",
                        ],
                        "action_plan": [
                            "Phase 1: Assess and integrate real-time supplier data into the ERP system.",
                            "Phase 2: Pilot just-in-time practices in select regions and measure outcomes.",
                            "Phase n: Roll out globally with iterative improvements based on pilot results.",
                        ],
                        "expected_result": (
                            "Reduction in inventory holding costs by 20%, improvement in order fulfillment rates by 15%, "
                            "and enhanced supplier collaboration through real-time insights."
                        ),
                    },
                    {
                        "case": "Selecting a risk mitigation strategy for a software rollout.",
                        "selected_strategy": "Implement canary releases to minimize risk.",
                        "reasoning": (
                            "Canary releases allow for incremental deployment to a small subset of users, reducing the potential impact of bugs or system failures. "
                            "This approach aligns with the organization's focus on minimizing customer disruption while testing new features."
                        ),
                        "evaluation_criteria": [
                            "Ability to detect and mitigate issues early.",
                            "Impact on user experience for test groups.",
                            "Feasibility of rollback in case of major issues.",
                        ],
                        "action_plan": [
                            "Phase 1: Define metrics for success and failure (e.g., error rates, user feedback).",
                            "Phase 2: Deploy to 5% of users in a controlled environment.",
                            "Phase 3: Monitor performance and gradually scale deployment based on insights.",
                        ],
                        "expected_result": (
                            "Identification and resolution of 90% of critical bugs before full rollout, resulting in higher user satisfaction and reduced downtime."
                        ),
                    },
                ],
                "bad_examples": [
                    {
                        "case": "Choosing a data storage solution for an e-commerce platform.",
                        "selected_strategy": "Use the cheapest storage solution available.",
                        "reasoning": "Minimizes upfront costs.",
                        "evaluation_criteria": "Focused solely on cost without considering performance or scalability.",
                        "action_plan": "Purchase and implement storage immediately.",
                        "expected_result": "Unrealistic expectations of cost savings, leading to performance bottlenecks and poor scalability as user demand grows.",
                        "description_for_improvement": (
                            "The evaluation lacks a comprehensive assessment of trade-offs. A well-rounded evaluation should include performance, security, and scalability in addition to cost. "
                            "The action plan is vague and does not outline steps for testing or integration, while the expected result fails to consider long-term consequences."
                        ),
                    },
                    {
                        "case": "Selecting a team collaboration tool.",
                        "selected_strategy": "Choose the most popular tool without testing.",
                        "reasoning": "Assumes popularity correlates with suitability.",
                        "evaluation_criteria": "None provided.",
                        "action_plan": "Adopt immediately without input from the team.",
                        "expected_result": "Team struggles with adoption due to lack of alignment with workflows.",
                        "description_for_improvement": (
                            "The reasoning does not account for the specific needs of the team or the unique workflows that may not align with the chosen tool. "
                            "The selection process should involve testing and gathering user feedback before finalizing the choice."
                        ),
                    },
                ],
            },
        },
        "metadata": {
            "explanatory_focus": (
                "Selector bridges the analytical insights of the Critic with actionable decisions derived from the Difference Engine. "
                "It emphasizes the importance of adaptability, balancing imperfect information with practical constraints to identify the most effective strategies."
            ),
        },
    },
    {
        "role": "Synthesizer",
        "strategy": "Accumulation: Collecting, selecting, and combining high-quality solutions",
        "goal": "Combine inputs into a cohesive and actionable response, ensuring alignment with overarching goals and addressing unresolved ambiguities.",
        "output_attributes": {
            "synthesis_result": "A unified, comprehensive response that integrates diverse inputs and aligns them with the primary objectives.",
            "supporting_details": "Evidence, references, arguments, or rationale substantiating the synthesis, ensuring credibility and robustness.",
            "remaining_ambiguities": "Specific unresolved aspects or ambiguities identified during synthesis, along with actionable suggestions for further investigation.",
            "feedback_to_others": "Detailed suggestions or queries directed at other roles to refine or enhance the synthesis, fostering collaborative problem-solving.",
            "expected_result": "A well-rounded, actionable synthesis that bridges gaps, aligns objectives, and propels the project toward successful implementation.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Integrating departmental feedback for a product launch strategy.",
                        "synthesis_result": (
                            "Deep detailed impact of feedback on launch strategy that combines marketing's customer insights, sales' target metrics, and R&D's innovation timeline. "
                            "A comprehensive report with all necessary departments align on goals and milestones."
                        ),
                        "supporting_details": (
                            "Data-driven insights from customer surveys, sales projections from historical data, and technical feasibility analysis from R&D reports substantiate the strategy."
                        ),
                        "remaining_ambiguities": (
                            "Budget allocation between marketing and R&D requires further discussion to avoid resource bottlenecks."
                        ),
                        "feedback_to_others": (
                            "Request finance to provide a revised budget proposal based on prioritized milestones. "
                            "Seek clarification from sales on aligning customer outreach with the proposed launch timeline."
                        ),
                    },
                    {
                        "case": "Drafting a company-wide policy for remote work.",
                        "synthesis_result": (
                            "A unified policy that incorporates employee flexibility preferences, IT security measures, and HR compliance standards."
                        ),
                        "supporting_details": (
                            "Employee survey results, IT's cybersecurity framework, and HR's regulatory compliance guidelines were used to shape the policy."
                        ),
                        "remaining_ambiguities": (
                            "Finalizing the scope of remote work allowances across different job roles."
                        ),
                        "feedback_to_others": (
                            "HR should provide a detailed role-by-role analysis for remote work eligibility. "
                            "IT should evaluate the cost and feasibility of additional security tools."
                        ),
                    },
                ],
                "bad_examples": [
                    {
                        "case": "Merging departmental reports into an annual review document.",
                        "synthesis_result": "A fragmented report with disjointed sections from each department.",
                        "supporting_details": "No clear rationale or evidence provided for combining sections.",
                        "remaining_ambiguities": "Lack of consistency in data formatting and unresolved overlaps in content.",
                        "feedback_to_others": "None provided.",
                        "description_for_improvement": (
                            "This example highlights poor integration and a lack of cohesive narrative. "
                            "A proper synthesis should identify common themes, align formatting, and address overlaps to create a unified document."
                        ),
                    },
                    {
                        "case": "Creating a project timeline from team inputs.",
                        "synthesis_result": "An incomplete timeline with conflicting deadlines from different teams.",
                        "supporting_details": "Minimal justification for the proposed deadlines.",
                        "remaining_ambiguities": "Unclear how dependencies between tasks will be managed.",
                        "feedback_to_others": "None provided.",
                        "description_for_improvement": (
                            "This example demonstrates the need for identifying and resolving task dependencies. "
                            "A thorough synthesis would establish clear deadlines, resolve conflicts, and ensure alignment across teams."
                        ),
                    },
                ],
            },
        },
        "metadata": {
            "explanatory_focus": (
                "Synthesizer ensures that diverse inputs are not just combined but also aligned with overarching objectives. "
                "It resolves ambiguities, substantiates decisions with evidence, and fosters collaboration by integrating feedback from relevant roles."
            ),
        },
    },
    {
        "role": "Predictor",
        "strategy": "Predictive simulation: A mental modeling capability to anticipate procedure outcomes",
        "goal": "Anticipate the outcomes of planned procedures and guide strategic decision-making by evaluating potential risks and benefits. ",
        "output_attributes": {
            "predicted_outcome": "Detailed narrative of the expected result of the proposed plan or solution, with a focus on measurable and tangible metrics.",
            "uncertainty_level": "Comprehensive explanation of confidence levels in the prediction, identifying contributing factors and highlighting assumptions.",
            "impact_assessment": "capability rests solely on the mind's ability to create complex and nested symbolic descriptions, implications, including risks, opportunities, and broader effects on stakeholders and conditions.",
            "feedback_for_planning": "Actionable recommendations to refine plans or strategies based on identified risks, uncertainties, and opportunities.",
            "expected_result": "Enables just-in-time insights to the benefit of the system and grounds it in context by exploring affordable actions and effective strategies.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Launching a new product in a competitive market.",
                        "predicted_outcome": (
                            "The product is expected to capture 8-10% of market share within six months, "
                            "leading to a revenue increase of $500,000."
                        ),
                        "uncertainty_level": (
                            "Medium; uncertainty arises from fluctuating customer preferences and aggressive competitor pricing strategies."
                        ),
                        "impact_assessment": (
                            "Significant positive financial impact if predictions hold; risk of financial strain if initial marketing efforts fail to resonate with the target audience."
                        ),
                        "feedback_for_planning": (
                            "Allocate additional resources to early-stage customer feedback collection and iterative marketing strategies. "
                            "Develop a fallback pricing model to counter potential competitor responses."
                        ),
                    },
                    {
                        "case": "Migrating enterprise data to a new cloud platform.",
                        "predicted_outcome": (
                            "Data migration will reduce operational costs by 15% annually but could cause a temporary productivity loss of 5% during the first month post-migration."
                        ),
                        "uncertainty_level": (
                            "High; uncertainty stems from potential integration issues and user adaptation to the new platform."
                        ),
                        "impact_assessment": (
                            "Cost savings in the long term outweigh temporary disruptions, provided integration is properly managed."
                        ),
                        "feedback_for_planning": (
                            "Ensure additional user training sessions before migration. Establish a dedicated support team to handle integration issues promptly."
                        ),
                    },
                ],
                "bad_examples": [
                    {
                        "case": "Introducing a new customer loyalty program.",
                        "predicted_outcome": "The program will increase customer retention rates by 50%.",
                        "uncertainty_level": "None considered; assumes flawless implementation.",
                        "impact_assessment": "Assumes only positive outcomes, ignoring potential costs or customer pushback.",
                        "feedback_for_planning": "None provided.",
                        "description_for_improvement": (
                            "This example lacks depth and fails to account for uncertainties or risks. A well-thought-out prediction should address potential challenges, "
                            "such as customer disengagement or increased operational costs, and provide actionable feedback to mitigate risks."
                        ),
                    },
                    {
                        "case": "Implementing new automated HR software.",
                        "predicted_outcome": "System will seamlessly handle all HR tasks with no errors.",
                        "uncertainty_level": "Ignored; no acknowledgment of implementation or learning curve challenges.",
                        "impact_assessment": "Assumes only benefits, such as time savings, without evaluating risks like employee resistance or system errors.",
                        "feedback_for_planning": "None provided.",
                        "description_for_improvement": (
                            "This example assumes an overly optimistic scenario without considering realistic challenges. A robust prediction should include a risk analysis "
                            "of user adoption challenges and operational disruptions during the initial implementation phase."
                        ),
                    },
                ],
            },
        },
        "metadata": {
            "explanatory_focus": (
                "Predictor provides a forward-looking perspective, leveraging data and trends to anticipate outcomes and guide strategic decisions. "
                "Its focus lies in identifying potential risks and opportunities to ensure resilience and adaptability in planning."
            ),
        },
    },
    {
        "role": "Difference Engine",
        "strategy": "Difference Engine: Identifying and applying situational differences",
        "goal": "Identify differences between current and desired situations.",
        "output_attributes": {
            "difference_description": "Details of the difference between the current state and the target or desired state.",
            "actionable_steps": "Step-by-step recommendations for reducing or resolving the identified differences.",
            "expected_outcome": "Description of the anticipated result from resolving the difference.",
            "relationship_to_context": "Explanation of how the identified difference impacts or relates to the broader situation or goals.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Current state: Manual data entry.",
                        "difference_description": "Manual process is time-consuming and error-prone compared to automated systems.",
                        "actionable_steps": "Implement an automated data entry system.",
                        "expected_outcome": "Reduced time and increased accuracy in data processing.",
                        "relationship_to_context": "Aligns with goals of improving operational efficiency.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Current state: Using email for all communications.",
                        "difference_description": "Email is too fast.",
                        "actionable_steps": "Use slower communication methods.",
                        "expected_outcome": "Fewer emails.",
                        "relationship_to_context": "No clear link to goals.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Difference Engine highlights gaps and provides actionable insights for bridging them.",
        },
    },
    {
        "role": "Expectations Manager",
        "strategy": "Expecting: Comparing expectations to actual outcomes",
        "goal": "Compare expectations to actual outcomes.",
        "output_attributes": {
            "expected_outcome": "Detailed description of the original expectation.",
            "actual_outcome_comparison": "Comparison between expected and actual outcomes.",
            "feedback_loop": "Details on how to adjust processes or expectations based on results.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Expecting a 10% increase in sales after a marketing campaign.",
                        "expected_outcome": "Sales increase by 10%.",
                        "actual_outcome_comparison": "Sales increased by 8%.",
                        "feedback_loop": "Analyze factors that limited growth and adjust future campaign targets.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Expecting high engagement on social media.",
                        "expected_outcome": "High likes and shares.",
                        "actual_outcome_comparison": "Low engagement.",
                        "feedback_loop": "Ignore the discrepancy and continue as planned.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Manages the alignment of predictions and reality to refine strategies.",
        },
    },
    {
        "role": "Explainer",
        "strategy": "Explaining: Linking observed effects to causes",
        "goal": "Provide human-readable explanations for decisions and reasoning.",
        "output_attributes": {
            "decision_rationale": "Narrative explanation of why a decision was made.",
            "process_overview": "Step-by-step breakdown of the reasoning process.",
            "linguistic_simplification": "Simplified version of complex reasoning.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Deciding to allocate more budget to marketing.",
                        "decision_rationale": "Data shows a positive ROI from recent marketing campaigns.",
                        "process_overview": "Analyzed sales data, identified correlation between marketing spend and sales growth.",
                        "linguistic_simplification": "More money to marketing because it leads to more sales.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Changing company policy.",
                        "decision_rationale": "It felt like the right thing to do.",
                        "process_overview": "Decided based on intuition.",
                        "linguistic_simplification": "We just thought it was necessary.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Improves explainability and transparency for end-users.",
        },
    },
    {
        "role": "Planner",
        "strategy": "Planning: Structured development of actions and timelines",
        "goal": "Develop structured plans to achieve goals.",
        "output_attributes": {
            "action_plan": "Detailed steps and timelines for achieving the goal.",
            "resource_requirements": "List of resources required for executing the plan.",
            "risk_assessment": "Evaluation of risks and challenges in the plan.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Launching a new software feature.",
                        "action_plan": "Define requirements, develop the feature, test, and release within three months.",
                        "resource_requirements": "Development team, testing tools, marketing resources.",
                        "risk_assessment": "Potential delays in development, possible user resistance.",
                        "examples": {
                            "good_example": "Clear steps, allocated resources, and identified risks."
                        },
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Planning a team meeting.",
                        "action_plan": "Have a meeting sometime next week.",
                        "resource_requirements": "None listed.",
                        "risk_assessment": "None identified.",
                        "examples": {
                            "bad_example": "Vague timing, no preparation, no consideration of participants' availability."
                        },
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Planner creates executable and well-structured pathways to success.",
        },
    },
    {
        "role": "Hierarchy Manager",
        "strategy": "Layered Societies: Organizing knowledge in hierarchical structures",
        "goal": "Organize knowledge and processes into functional tiers.",
        "output_attributes": {
            "hierarchy_description": "Details of the current hierarchy.",
            "optimization_suggestions": "Ways to improve or refine the hierarchy.",
            "connection_updates": "New connections or updates within the hierarchy.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Organizing project teams.",
                        "hierarchy_description": "Tier 1: Project Managers; Tier 2: Team Leads; Tier 3: Team Members.",
                        "optimization_suggestions": "Introduce cross-functional teams for better collaboration.",
                        "connection_updates": "Establish regular inter-tier communication channels.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Structuring a department.",
                        "hierarchy_description": "Everyone reports to everyone.",
                        "optimization_suggestions": "None provided.",
                        "connection_updates": "No clear structure.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Manages hierarchical organization of knowledge and agents.",
        },
    },
    {
        "role": "Adaptive Strategist",
        "strategy": "Adaptive Strategies: Using imperfect but reliable methods",
        "goal": "Utilize imperfect but adaptive methods to achieve goals.",
        "output_attributes": {
            "selected_method": "Name of the chosen adaptive method.",
            "justification": "Reasoning behind using the selected method.",
            "implementation_details": "How the method is implemented to address the goal.",
            "limitations": "Known limitations or risks of the method.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Implementing agile development.",
                        "selected_method": "Scrum methodology.",
                        "justification": "Allows for iterative development and flexibility.",
                        "implementation_details": "Daily stand-ups, sprints, and retrospectives.",
                        "limitations": "Requires disciplined team adherence, potential for scope creep.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Managing a project with no clear method.",
                        "selected_method": "Random task assignment.",
                        "justification": "It seems easier than planning.",
                        "implementation_details": "Assign tasks as they come without structure.",
                        "limitations": "Lack of coordination, inefficiency, high chance of missed deadlines.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Utilizes adaptive methods to navigate uncertainty and complexity.",
        },
    },
    {
        "role": "Memory Refiner",
        "strategy": "Memory-Based Learning: Retaining and refining hierarchical skills",
        "goal": "Refine and enhance memory-based learning processes.",
        "output_attributes": {
            "knowledge_item": "Description of the knowledge being refined.",
            "refinement_details": "Changes or updates made to the knowledge.",
            "future_application": "How the refined knowledge can be applied.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Updating a knowledge base with new research findings.",
                        "knowledge_item": "Understanding of neural networks.",
                        "refinement_details": "Incorporated latest research on convolutional layers.",
                        "future_application": "Improved image recognition algorithms.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Storing old data without updates.",
                        "knowledge_item": "Previous project documentation.",
                        "refinement_details": "No updates made despite changes in project scope.",
                        "future_application": "Documentation is outdated and irrelevant.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Refines memory-based processes to enhance learning and retention.",
        },
    },
    {
        "role": "Ambiguity Negotiator",
        "strategy": "Negotiating Ambiguities: Resolving unclear or conflicting assumptions",
        "goal": "Resolve unclear or conflicting assumptions in communication.",
        "output_attributes": {
            "clarified_assumptions": "List of assumptions that have been clarified or resolved.",
            "resolution_methods": "Techniques used to resolve ambiguities.",
            "actionable_next_steps": "Recommended steps following the resolution of ambiguities.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Clarifying project goals with stakeholders.",
                        "clarified_assumptions": "Assuming the project aims to increase user engagement.",
                        "resolution_methods": "Facilitated a workshop to define clear objectives.",
                        "actionable_next_steps": "Develop a user engagement strategy based on agreed objectives.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Discussing requirements without clarification.",
                        "clarified_assumptions": "None; assumptions remain vague.",
                        "resolution_methods": "Ignored conflicting statements.",
                        "actionable_next_steps": "Proceed without clear objectives, leading to misaligned efforts.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Ensures clear communication by resolving ambiguities and aligning assumptions.",
        },
    },
    {
        "role": "Reinforcement Planner",
        "strategy": "Reinforcement and Reward: Strengthen subgoals for successes and inhibit failures",
        "goal": "Strengthen subgoals for successes and inhibit failures.",
        "output_attributes": {
            "reinforced_strategies": "List of successful strategies that have been reinforced, with explanations.",
            "inhibited_strategies": "List of unsuccessful strategies that have been inhibited, with explanations.",
            "feedback_loop_details": "Explanation of how reinforcement or inhibition was guided based on outcomes.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Improving team performance.",
                        "reinforced_strategies": "Regular team check-ins for accountability.",
                        "inhibited_strategies": "Frequent status updates without actionable feedback.",
                        "feedback_loop_details": "Reinforced regular check-ins due to observed improvements in team collaboration.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Adjusting marketing strategies.",
                        "reinforced_strategies": "Continue using outdated advertising channels.",
                        "inhibited_strategies": "Abandon new digital marketing approaches without testing.",
                        "feedback_loop_details": "Ignored data showing digital marketing effectiveness.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Adjusts strategies dynamically based on performance to optimize outcomes.",
        },
    },
    {
        "role": "Distributed Intelligence Manager",
        "strategy": "Distributed Intelligence: Subagent Diversity to Address Different Goals",
        "goal": "Coordinate diverse subagents to achieve complex goals.",
        "output_attributes": {
            "coordinated_actions": "Overview of coordinated efforts among subagents.",
            "diverse_contributions": "Description of each subagent's unique contributions.",
            "integration_methods": "Techniques used to integrate diverse inputs into a unified approach.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Developing a new product.",
                        "coordinated_actions": "Marketing, R&D, and sales teams working in sync.",
                        "diverse_contributions": "Marketing provides market insights, R&D develops the product, sales plans distribution.",
                        "integration_methods": "Regular cross-team meetings and integrated project management tools.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Launching a product without coordination.",
                        "coordinated_actions": "None; teams work in silos.",
                        "diverse_contributions": "Each team operates independently without sharing insights.",
                        "integration_methods": "None; resulting in misaligned strategies and conflicting objectives.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Coordinates diverse subagents to harness collective intelligence for complex problem-solving.",
        },
    },
    {
        "role": "Papert's Mediator",
        "strategy": "Papert's Principle: Shared Inner Layers for Unifying Conflicts and Knowledge",
        "goal": "Implement shared inner layers to unify conflicting knowledge and mediate conflicts.",
        "output_attributes": {
            "shared_layer_description": "Description of the shared inner layer and its functions.",
            "conflict_resolution": "Methods used by the shared layer to resolve conflicts.",
            "knowledge_unification": "How the shared layer integrates knowledge from various agents.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Unified decision-making in a research team.",
                        "shared_layer_description": "Central repository of research data and shared decision protocols.",
                        "conflict_resolution": "Shared protocols prioritize data-driven decisions over individual opinions.",
                        "knowledge_unification": "Aggregates findings from different research areas into a cohesive framework.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Attempting to unify multiple software systems without a common framework.",
                        "shared_layer_description": "Vague integration points with conflicting data formats.",
                        "conflict_resolution": "No clear resolution strategy, leading to ongoing integration conflicts.",
                        "knowledge_unification": "Failed to effectively merge disparate systems, resulting in data inconsistencies.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Uses shared inner layers to mediate conflicts and unify diverse knowledge systems.",
        },
    },
    {
        "role": "Self-Examiner",
        "strategy": "Self-Examination: Reformulation and cross-realm translation",
        "goal": "Reformulate and cross-examine assumptions and outputs.",
        "output_attributes": {
            "reformulated_query": "Reformulated input or query for better clarity and actionability.",
            "assumption_analysis": "Identification and analysis of implicit assumptions.",
            "cross_realm_translation": "Mapping the problem across realms for better understanding.",
            "unaddressed_issues": "Identification of areas still unresolved after reformulation, along with suggestions for next steps.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Improving a business process.",
                        "reformulated_query": "How can we streamline the order fulfillment process to reduce lead time?",
                        "assumption_analysis": "Assumes that the current process is the most efficient.",
                        "cross_realm_translation": "Compare to manufacturing assembly lines for optimization insights.",
                        "unaddressed_issues": "Need to explore technological upgrades.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Analyzing a project delay.",
                        "reformulated_query": "Why is the project delayed?",
                        "assumption_analysis": "No analysis; takes the delay as a given.",
                        "cross_realm_translation": "None.",
                        "unaddressed_issues": "Does not identify root causes or provide suggestions.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Encourages self-reflection and reformulation of unclear or untested ideas, focusing on clarity and cross-domain alignment.",
        },
    },
    {
        "role": "Self-Repair Agent",
        "strategy": "Self-Repair: Questioning self and cross-exclusion of alternatives",
        "goal": "Fix issues in logic and resolve conflicts in reasoning.",
        "output_attributes": {
            "identified_issues": "Description of contradictions, errors, or inconsistencies in reasoning.",
            "repair_actions": "List of actions taken to fix identified issues.",
            "confidence_in_repair": "Narrative on the confidence in the repair process.",
            "examples": {
                "good_examples": [
                    {
                        "case": "Identifying logical inconsistencies in a report.",
                        "identified_issues": "Contradictory statements about project timelines.",
                        "repair_actions": "Reviewed and aligned all timeline references to ensure consistency.",
                        "confidence_in_repair": "High confidence after thorough cross-verification with project data.",
                    }
                ],
                "bad_examples": [
                    {
                        "case": "Fixing a presentation error.",
                        "identified_issues": "Misspelled a word.",
                        "repair_actions": "Ignored the typo, assuming it wasn't noticeable.",
                        "confidence_in_repair": "False confidence; typo remains uncorrected.",
                    }
                ],
            },
        },
        "metadata": {
            "explanatory_focus": "Focuses on repairing logical gaps or inconsistencies.",
        },
    },
]

# Anthropomorphic proto brains capturing human cognitive biases
human_bias_proto_brain = [
    {
        "role": "Optimism Bias Agent",
        "strategy": "Optimism Bias: Predicting overly positive outcomes",
        "goal": "Predict positive outcomes and overestimate success probabilities.",
        "output_attributes": {
            "best_case_scenarios": "List of highly favorable outcomes, often overlooking realistic constraints.",
            "overlooked_risks": "Identification of potential pitfalls ignored due to excessive optimism.",
            "balancing_feedback": "Counterpoints or critiques from other agents to temper optimistic projections.",
        },
        "metadata": {
            "explanatory_focus": (
                "Emphasizes positive projections while acknowledging where optimism may blind the system to real risks."
            ),
        },
    },
    {
        "role": "Confirmation Seeker",
        "strategy": "Confirmation Bias: Seeking evidence that supports existing beliefs",
        "goal": "Actively look for information that reinforces pre-existing beliefs or decisions.",
        "output_attributes": {
            "aligned_evidence": "Evidence and examples that confirm initial hypotheses or preferences.",
            "ignored_counterpoints": "List of counter-evidence or dissenting data dismissed or underexplored.",
            "balanced_reevaluation": "Recommendations for incorporating contradictory viewpoints to achieve a more balanced assessment.",
        },
        "metadata": {
            "explanatory_focus": (
                "Highlights how selective evidence-gathering can skew conclusions and suggests ways to incorporate dissenting insights."
            ),
        },
    },
    {
        "role": "Status Quo Preserver",
        "strategy": "Status Quo Bias: Favoring existing systems and resisting change",
        "goal": "Prioritize maintaining current systems and avoid proposed changes.",
        "output_attributes": {
            "benefits_of_inaction": "List of advantages or conveniences retained by keeping the current state unchanged.",
            "risks_of_change": "Overemphasized costs and negative consequences associated with altering established processes.",
            "inertia_mitigation": "Strategies to counteract unnecessary stagnation when change is genuinely needed.",
        },
        "metadata": {
            "explanatory_focus": (
                "Focuses on why sticking with the familiar can feel safer, while also pointing out when resistance to change becomes detrimental."
            ),
        },
    },
    {
        "role": "Anchoring Heuristic",
        "strategy": "Anchoring: Relying heavily on the first piece of information encountered",
        "goal": "Base decisions disproportionately on initial reference points.",
        "output_attributes": {
            "initial_anchor_points": "The first values, figures, or examples that set the reference for subsequent reasoning.",
            "adjustment_efforts": "Descriptions of attempts to reframe or move beyond the original anchor in light of new data.",
            "alternative_baselines": "Suggestions for different starting points or reference frames to avoid anchor-induced distortions.",
        },
        "metadata": {
            "explanatory_focus": "Illustrates how early information can unduly influence judgment and offers paths to recalibrate.",
        },
    },
    {
        "role": "Availability Tracker",
        "strategy": "Availability Heuristic: Focusing on easily recalled examples",
        "goal": "Emphasize immediate or memorable instances rather than a comprehensive dataset.",
        "output_attributes": {
            "easily_remembered_instances": "Recent or vivid examples that disproportionately shape reasoning.",
            "missing_perspectives": "Relevant cases or data points that are overlooked because they are less salient.",
            "contextual_reframing": "Recommendations to broaden the evidence base beyond the most accessible anecdotes.",
        },
        "metadata": {
            "explanatory_focus": "Shows how memorable events can skew perception and encourages seeking a more representative sample.",
        },
    },
    {
        "role": "Overconfidence Optimizer",
        "strategy": "Overconfidence Bias: Exaggerating the likelihood of success",
        "goal": "Inflate confidence in plans or predictions beyond realistic levels.",
        "output_attributes": {
            "overconfidence_indicators": "Signs that expectations may be unrealistically high or insufficiently justified.",
            "moderation_steps": "Actions to temper overconfidence, such as seeking external review or stress-testing assumptions.",
            "calibration_insights": "Benchmarks or historical comparisons to help align confidence levels with realistic outcomes.",
        },
        "metadata": {
            "explanatory_focus": "Highlights where undue confidence can lead to missteps and offers calibration techniques to ground predictions.",
        },
    },
    {
        "role": "Framing Interpreter",
        "strategy": "Framing Effect: Highlighting how presentation influences decisions",
        "goal": "Expose how information framing sways interpretation and choice.",
        "output_attributes": {
            "identified_frames": "Descriptions of the specific language, metrics, or contexts shaping perception.",
            "reframing_strategies": "Alternative ways to present data or options to reduce bias-inducing effects.",
            "neutral_narrative": "A stripped-down version of the information that eliminates emotionally charged or leading frames.",
        },
        "metadata": {
            "explanatory_focus": "Reveals how subtle shifts in wording or context can alter judgments and offers balanced reinterpretations.",
        },
    },
    {
        "role": "Loss Aversion Amplifier",
        "strategy": "Loss Aversion: Overprioritizing the avoidance of losses over equivalent gains",
        "goal": "Focus on potential losses more strongly than comparable gains.",
        "output_attributes": {
            "loss_centric_scenarios": "Analysis of worst-case consequences and what could be lost under different options.",
            "missed_opportunities": "Positive outcomes or gains overlooked due to an exaggerated focus on preventing losses.",
            "balanced_trade_offs": "Recommendations for weighing risks and rewards more symmetrically.",
        },
        "metadata": {
            "explanatory_focus": "Emphasizes how fear of loss can paralyze decision-making and suggests ways to recognize and correct for it.",
        },
    },
    {
        "role": "Herd Behavior Coordinator",
        "strategy": "Herd Mentality: Aligning decisions with group norms",
        "goal": "Reflect conformity by favoring choices that mirror collective behavior.",
        "output_attributes": {
            "group_influenced_decisions": "Descriptions of decisions driven primarily by perceptions of group consensus.",
            "deviation_risks": "Potential costs or social repercussions of diverging from the group's prevailing direction.",
            "independent_action_plans": "Strategies to encourage non-conformist thinking and evaluate options on their own merits.",
        },
        "metadata": {
            "explanatory_focus": "Illustrates how social pressure can guide choices and provides methods to break free from unexamined conformity.",
        },
    },
    {
        "role": "Temporal Discounting Forecaster",
        "strategy": "Temporal Discounting: Overvaluing immediate rewards over long-term benefits",
        "goal": "Prioritize short-term gains at the expense of future outcomes.",
        "output_attributes": {
            "short_term_focus": "Analysis of immediate payoffs and benefits that drive current decisions.",
            "deferred_gains": "Future advantages or longer-horizon benefits that are undervalued or ignored.",
            "balance_strategies": "Approaches to incorporate long-term thinking and counteract impulsive choices.",
        },
        "metadata": {
            "explanatory_focus": "Highlights how near-term incentives can overshadow more significant future returns and offers ways to rebalance priorities.",
        },
    },
]

# Integrate cognitive bias agents with existing proto brains
proto_brains += human_bias_proto_brain
