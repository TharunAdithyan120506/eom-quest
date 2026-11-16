import json,pathlib,re,pymupdf
P=pathlib.Path(__file__).parent
qs=json.loads((P/'data/questions.json').read_text(encoding='utf8'))
c=json.loads((P/'data/curriculum.json').read_text(encoding='utf8'))
by={x['id']:x for x in c['lessons']}
maps=[
'roles international plans swot+tows organizing departmentation2 urwick hrm xy sources training authoritystyles staffing barriers controltypes+controlprocess',
'functions csr plans porter organizing departmentation2 urwick jobanalysis xy+herzberg recruitment training likert staffing groups+teams controlprocess',
'fayol ethics planningsteps bcg urwick matrix urwick sources herzberg recruitment training likert staffing groups+teams controlprocess',
'systems international plans swot+tows organizing departmentation2 urwick jobanalysis xy sources selection grid trainingmethods communication controltypes+controlprocess',
'fayol csr porter plans organizing departmentation2 urwick jobanalysis herzberg sources training authoritystyles trainingmethods communication controlprocess',
'functions international plans swot+tows organizing+formal span urwick hrm maslow selection training authoritystyles maslow+herzberg authoritystyles controlprocess',
'roles ethics plantypes porter+blueocean urwick departmentation+departmentation2+matrix urwick hrm herzberg sources training grid staffing groups controltypes',
'systems ethics mbo tows urwick departmentation+departmentation2 urwick jobanalysis maslow sources training likert staffing barriers controltypes']
labels=[f'{i}{x}' for i in range(1,6) for x in 'ABC']
for q in qs:
 q['topics']=maps[int(q['paper'][-1])-1].split()[labels.index(q['label'])].split('+')
 q['module']=by[q['topics'][0]]['module']
 q['guide']=[p for id in q['topics'] for p in by[id]['points']]
 q['tip']='Answer the exact command words. Define the concept, explain the relevant points and apply them to the situation. Include the requested diagram or quoted evidence.'
 q['caution']='These are study frameworks derived from your material, not official marking schemes.'

def tip(keys,s):
 for key in keys.split(): next(q for q in qs if q['id']==key)['tip']=s
tip('pyq1-1A','Use the original question image: its activities table is embedded as an image and is absent from text extraction. For each row, give both category and specific role. Decide whether the action concerns people, information or decisions.')
tip('pyq1-1C','Choose four clearly evidenced plans. The 10% profit target is an objective; buying only from organic farmers on credit expresses a purchasing policy; the production manner/procedure and staffing numbers need careful matching to the exact wording; the penalty for not wearing protective items supports a rule. Quote the relevant clause before explaining.')
tip('pyq1-2A pyq4-2A','Pick two tools actually covered in Module 2, such as SWOT/TOWS and BCG. Draw and label each framework, explain how to interpret it and show how the firm could use it. Do not merely list tool names.')
tip('pyq1-3A pyq7-3A','The papers explicitly ask for delegation, but the supplied lecture slides provide principles rather than a complete named four-step Flow of Delegation model. A study scaffold is: specify expected results → assign duties → give suitable authority → establish accountability/review. For escalated calls, define the resolution target, assign the calls, set decision limits and review outcomes. Treat this as a derived scaffold, not a verbatim slide model.')
tip('pyq2-3A pyq3-3A pyq4-3A pyq5-3A pyq6-3A pyq8-3A','Source gap: line and line-and-staff organization are asked in the papers, but receive no full standalone treatment in the supplied lecture deck. Use the hierarchy, scalar chain, unity of command and specialization principles to build your response. A line sketch shows a direct reporting chain. For line-and-staff, distinguish the operating chain from specialist advice/support and explain their collaboration. This is an interpretive framework, not an official answer key.')
tip('pyq1-4C','Product Development needs creative participation and room to contribute; democratic/participative leadership is defensible. Technical Support requires rapid, standardized responses, supporting more directive/autocratic behavior. Free-rein may be argued for a sufficiently capable creative team, but explain why the case supports the level of freedom you choose.')
tip('pyq1-5C','Advance orders, staffing and overtime in anticipation of demand support feedforward control. Survey results followed by software/battery improvements support feedback control. For standards, distinguish numeric output or manpower measures from time targets and customer-satisfaction goals; quote two explicit targets rather than treating every number as a standard.')
tip('pyq2-1A','Apply all five functions to the CEO: establish goals; arrange roles; appoint/develop people; lead; monitor results. Explain why conceptual skill is relatively most important at the top level.')
tip('pyq2-2A','Maruti’s broad low-cost position supports cost leadership. Patanjali’s stated niche of health-conscious Ayurvedic buyers and competitive pricing supports cost focus in this particular case. Explain both advantage and scope.')
tip('pyq2-2B','Follow the case sequence: identify daily tasks; group by expertise into departments; assign supervisors authority; formalize reporting and responsibility. Cite a short line for each organizing step.')
tip('pyq2-3B pyq4-3B pyq8-3B','Use two headings for one entry-level role. Job description: title, department/reporting, purpose and duties. Job specification: education, knowledge, skills and relevant personal/physical requirements where the notes support them. Make requirements appropriate to a fresher; do not invent mandatory industry certifications.')
tip('pyq2-3C','The prompt does not name one uniquely required theory. Theory Y supports autonomy for the innovation team, but its unclear goals require better direction. Herzberg supports growth/recognition and more satisfying work for both groups. Justify your chosen theory from evidence rather than declaring the repetitive-work team inherently lazy.')
tip('pyq3-1A','Specialized roles → division of labor; clear standards/deadlines → discipline; retention and development → stability of tenure; encouraging employees to own improvements → initiative. Quote evidence and explain each link.')
tip('pyq3-2A','Nescafé: star (high share/high growth); plant-based A+ alternatives: question mark (growth but still establishing share); Maggi: cash cow (high share/mature market). Milkmaid has low/declining growth, but the case does not explicitly give relative share: dog is a possible intended answer only if low share is assumed. State that assumption; high share would instead support cash cow. Tie strategy to both axes.')
tip('pyq3-2B','(i) Delegation, with authority/responsibility balance; (ii) specialization; (iii) unity of objectives. Use the exact scenario evidence.')
tip('pyq3-2C','The combination of experts from different functions around a project supports matrix departmentation. Draw functional and project relationships and discuss both pooled expertise and coordination/authority difficulties.')
tip('pyq3-3B','Promotion uses a known employee’s experience, supports continuity and can motivate internal career progression. Explain why these fit the urgent team-leader vacancy; do not simply list every recruitment source.')
tip('pyq4-4B','Preliminary interview screens basic suitability; a core interview investigates suitability in greater depth. Tie the contrast to the initial interview and interview stages in the selection sequence.')
tip('pyq4-4C','People over production → country club (1,9); hands-off with little direction or concern → impoverished (1,1); production with little concern for people → authority/task (9,1); high commitment to both → team (9,9). Use the case sequence and discuss pros/cons of each.')
tip('pyq4-5C','Read the full image and classify actions by timing: anticipating shortages is feedforward; intervention during activity is concurrent if supported by a specific action; using customer outcomes is feedback. The question also asks standards: identify actual performance yardsticks rather than any descriptive number.')
tip('pyq5-1A','Choose four of Fayol’s principles and explain their contribution to coordinated enterprise operation. Do not confuse this with Mintzberg’s ten roles.')
tip('pyq5-1C','Superior quality, customer service, technology and distinctive products support differentiation in the case. The narrative does not demonstrate a low-cost or narrow-market position. Connect each differentiating feature to competitive advantage.')
tip('pyq5-3B','The task asks for a job specification, not a full job description. Give six suitable candidate requirements for a GET, drawing on the categories in the job-analysis slides; connect them to production work and the stated reporting context.')
tip('pyq5-3C','Separate four hygiene/context factors from four motivators/job-content factors. Explain how good conditions can coexist with disengagement if recognition, achievement, responsibility or growth are absent.')
tip('pyq5-5A','Apply the source’s induction/orientation distinction and supply three factors for each. Make the introduction to the organization and familiarization with work concrete for newly recruited staff.')
tip('pyq5-5C','Choose four standard categories from the notes and pair each with an appropriate measure for the stated manufacturer: physical quantity, technical specification, monetary value, managerial performance or time. Explain how comparison would reveal a deviation.')
tip('pyq6-1B','Select three cultural dimensions actually described on Module 1 pages 93–98. For each, explain its effect on management behavior and use a clearly framed illustration based on the contrast; avoid unsupported country stereotypes.')
tip('pyq6-2A','Classify every listed factor by internal/external and helpful/harmful. Then build two actual TOWS strategies combining one internal and one external factor. A SWOT list without the two strategies leaves the question incomplete.')
tip('pyq6-2B','Give the organizing sequence, then a four-basis formal/informal comparison. A startup is not necessarily wholly informal, and an MNC still has informal relationships.')
tip('pyq6-2C','Choose four factors from the span-of-control slides. Explain how each increases or reduces supervision needs. The question asks for reasoning; the notes do not supply one universally correct number of direct reports.')
tip('pyq6-4A','Reproduce the employment-test classifications and diagrams from Module 4 pages 27–29. Explain how the measures support selection against job requirements, rather than listing tests without their purpose.')
tip('pyq6-5A','Map poor conditions and compensation to basic/security concerns; weak culture to belonging; limited career growth to esteem and/or self-actualization according to the detail. Propose matched actions, then discuss why individuals can have overlapping needs. Herzberg helps separate context problems from missing motivators.')
tip('pyq6-4C pyq6-5B','These two prompts repeat within this paper. Retain both in a timed paper. Compare autocratic, democratic and free-rein styles using decision authority, motivation and productivity rather than treating the repetition as an extraction error.')
tip('pyq7-1A','Disturbance handler addresses the emergency; resource allocator prioritizes scarce supplies; liaison and negotiator help secure supply; monitor/disseminator support accurate information. Put the most critical roles first and justify a practical action sequence.')
tip('pyq7-1C','Strategic: overall international expansion direction. Tactical: regional/departmental plans that implement it. Operational: concrete daily delivery and support activities. Label examples as applications of the case, not external facts about a named firm.')
tip('pyq7-2A','Contrast an incoherent attempt to combine generic strategies with Blue Ocean’s deliberate value innovation. Explain how eliminate/reduce and raise/create can pursue lower cost and higher buyer value together; do not claim every mixed strategy automatically succeeds.')
tip('pyq7-4C','AK = 9,1; BK = 1,9; CK = 5,5; DK = 9,9. Draw both axes and also label the fifth style, 1,1, even though no manager in this case exemplifies it.')
tip('pyq7-5C','End-of-course feedback used next semester is feedback control. Monthly reviews with immediate adjustment are concurrent control. Timetable changes anticipating lost classes are feedforward control. Quote a line and explain the timing and purpose of each.')
tip('pyq8-2A','A WO strategy uses an external opportunity to address a weakness. If it successfully develops capability, that former weakness can become a strength; the firm can then use an SO strategy. Explain the change over time rather than treating TOWS as a permanent label.')
tip('pyq8-2B','(i) Organizational efficiency; (ii) flexibility; (iii) functional definition. Support each with the specific action: remove redundant costs, adapt to changes, clarify roles/reporting.')
tip('pyq8-3C','A: safety is the highest explicit unmet level, with physiological concerns also present. B: esteem is higher than the also-unmet belonging need. C: blocked development supports self-actualization; an esteem interpretation needs explicit justification. D: self-actualization. E: esteem. For A provide timely pay and safe transport; for D allow meaningful creative contribution to training. These are reasoned interpretations, not an official key.')
tip('pyq8-4C','In the presented order: collaborative co-creation = participative; centralized decisions with rewards and goodwill = benevolent-authoritative; strict targets without consultation = exploitative-authoritative; seeking input before leaders decide = consultative.')
tip('pyq8-5C','Use one coherent service example across before/during/after: prepare capacity before demand, monitor service during operation, and use customer results after service. These illustrate the PDF’s control concepts, not claims about Jio’s actual practices.')

# Extract marks from their printed positions; May 2026 changes the first two groups.
for f in (P.parent/'pyq').glob('*.pdf'):
 for page in pymupdf.open(f):
  words=page.get_text('words')
  for w in words:
   if not re.fullmatch(r'[1-5][ABC]\)',w[4]): continue
   matches=[v for v in words if re.fullmatch(r'\([34]\)',v[4]) and v[0]>page.rect.width*.8 and abs(w[1]-v[1])<5]
   assert len(matches)==1,(f,w)
   next(q for q in qs if q['id']==f'pyq{f.name[0]}-{w[4][:2]}')['marks']=int(matches[0][4][1])

(P/'data/questions.json').write_text(json.dumps(qs,ensure_ascii=False),encoding='utf8')
print(len(qs),'question frameworks')
