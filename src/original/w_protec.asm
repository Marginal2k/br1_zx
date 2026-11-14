;----------------проверка защиты--

PROTeC ; ПРoВЕРКА ЗАЩИТЫ
	DI
	LD	A,R ;один из четырёх
	AND	%11
	LD	HL,WX_BAD
	CALL	WT
	LD	B,6 ;число попыток
	LD	C,H
	LD	A,L
	AND	%1111
	LD	D,A
	LD	A,L
	RRCA
	RRCA
	RRCA
	RRCA
	AND	%1111
	ADD	A,#90
	LD	E,A
	EX	AF,AF'
;
W200	PUSH	HL ;dummy
	PUSH	DE ;DE=trk/sec
	PUSH	AF ;NC/C-начало нов ур-ня/отгрузка
	PUSH	BC ;C=cмещение_дефекта/2
	CALL	RND
	LD	L,A
	LD	H,#66 ;#66XX - данные сравнения
	PUSH	HL
	PUSH	DE
	LD	A,1
	LD	(SIDE),A
	LD	B,A
	CALL	D_WRITE
	POP	DE
	LD	HL,DSCR ;буф сравнения
	PUSH	HL
	LD	B,1
	CALL	D_READ
	POP	DE
	POP	HL
	JR	NC,W201 ;сектор без дефекта
	XOR	A
W100	EX	AF,AF'
	LD	A,(DE)
	CP	(HL)
	JR	NZ,W101
	INC	HL
	INC	HL
	INC	DE
	INC	DE
	EX	AF,AF'
	INC	A
	JR	Z,W201 ;сектор без дефекта
	JR	NZ,W100
W101 ;пределы дефекта при записи 15*2..225*2
;пределы дефекта при чтении 12*2..250*2
	POP	BC
	PUSH	BC
	EX	AF,AF'
	CP	250
	JR	NC,W201 ;сектор без дефекта
	CP	12
	JR	C,W201 ;сектор не найден
	SUB	C
	ADD	A,10
	CP	22 ;царапина не на месте
	JR	NC,W201
	POP	BC
	POP	AF ;ок
	JR	C,W300 ;подгр
	CALL	SEEonn ;0 нов ур
	CALL	setC1 ;0
	CALL	setMAP ;0
	JR	W300
W201	CALL	TR000
	POP	BC
	POP	AF
	POP	DE
	POP	HL
	DJNZ	W200 ;превышено число попыток?
;неудача
W300	POP	DE
	POP	AF
	RET

