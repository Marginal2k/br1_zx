; Чёрный Ворон: загрузчик диска 1 (файл "br1" TR-DOS, #6000..#63FF) = START1 + интро + инструкция.
; В 1997 году - boot-сектор (1 КБ на #5D25) нестандартного диска; теперь обычный файл TR-DOS.
; Оригинал: src/original/ (W&START1.A80 в архиве). Диск читается через disk.asm (файлы диска - по таблице F_DAT,
; build/disk1_layout.inc). Распаковка - ZX0 (dzx0.asm) вместо LPZ.

LOADER	EQU	#6000
	ORG	LOADER

; Чёрный Ворон
; Стартовый менеджер загрузки заставки
; а затем - фильм, инструкция или игра

DSCR	EQU	#4000
SCR	EQU	#C000
	MACRO	D_ 
	DI
	HALT
	EI
	ENDM

	JP	START ;#6000: запуск (BASIC: RANDOMIZE USR 24576)
	JP	F_CUT ;#6003: вход из концовки (см. levels/w_117end.asm): A=дисковод, B=0/1 победа людей/кунгов
	DEFB	#D1,#BB ;#6006: метка диска 1 (концовка по ней проверяет, что прочитан загрузчик)
	DEFM	"  Black Raven StartUp Manager  "
;Декомпрессор ZX0
	INCLUDE "dzx0.asm"
DELPZ	EQU	DELPC ;HL = поток (после слова длины), DE = куда

DELPZF	LD	DE,#FFFE
;Декомпрессор
;HL - ОТКУДА И КУДА, DE - ВЕРХНЯЯ ГРАНИЦА ОБЛАСТИ
DELPZX	PUSH	HL
	LD	C,(HL)
	INC	HL
	LD	B,(HL)
	ADD	HL,BC
	LDDR
	EX	DE,HL
	INC	HL
	POP	DE
	JP	DELPZ

MEM0	XOR	A ;Cтандартная страница-0
	JR	MEM

MEM7	LD	A,7
MEM	OR	%10000
	PUSH	BC
	LD	BC,#7FFD
	OUT	(C),A
	POP	BC
	RET

OFFD	XOR	A
OFFD__	LD	DE,DSCR+#1AFE
	LD	HL,DSCR+#1AFF
	LD	BC,768
	LD	(HL),A
	LDDR
	RET

OFFS	CALL	MEM7
OFFS_	LD	DE,SCR+#1AFE
	LD	HL,SCR+#1AFF
	LD	BC,768
	LD	(HL),0
	LDDR
	RET

SW5	LD	A,%10000 ;норм экр
	JR	SW_
SW7	LD	A,%11000
SW_	LD	(MEM+1),A ;доп экр
	RET

	INCLUDE "disk.asm" ;чтение секторов TR-DOS (READ, POS, TR00, DRIVE)

F_DAT ;таблица файлов диска 1: сектор 1..16, дорожка, число секторов (по 3 байта на файл), генерирует build.py
	INCLUDE "disk1_layout.inc"
START ;начало начал
	DI
	IM	1
	LD	A,#3F ;I - как в ПЗУ (не "сжимаемая" память)
	LD	I,A
	LD	SP,LOADER+#3FE
;               JP bFLAG
;               JP bINSTR
;               JP bFLICK
;drive num
	LD	A,(23798)
	LD	(DRIVE),A
;Заставка
	LD	A,%1001
	OUT	(254),A
	CALL	OFFD__
	CALL	MEM7
	LD	A,1
	CALL	LOADF
	LD	DE,SCR
	LD	HL,CROW+2
	CALL	DELPZ
	CALL	SW7
;если ЕНТЕР нажат, сразу грузи игру
	LD	BC,#BFFE
	IN	A,(C)
	RRA
	JR	NC,bGAME
;
	LD	A,3
	CALL	MEM
	LD	A,2
	CALL	LOADG
	LD	A,4
	CALL	MEM
	LD	A,3
	CALL	LOADG
	CALL	MEM0
	LD	A,4
	CALL	LOADF
	CALL	bFLAG ;-->
;
LOADG	CALL	LOADF
	LD	HL,#C000
	JP	DELPZF

;-------------

bGAME ;загрузка игры ; страницы 0(F6),1,7,6(F13), карта(F12), код игры (F8), 3,4
;В 1997 году файл читался сразу в окно #C000 и распаковывался "на месте"; для ZX0 это небезопасно, и читать файл в то же
;окно, куда он распаковывается, нельзя. Здесь (build.py проверяет пересечения всех шагов: check_loader):
; 1. страницы 0,1,7,6 и карта (F12, 4 КБ -> #4000-#4FFF через окно страницы 5) читаются в BUF1 (#8000: страница 2 пока
;    свободна) и распаковываются в окно #C000 своей страницы;
; 2. код игры (F8) читается в окно #C000 страницы 3 (она пока пуста) и распаковывается в живую страницу 2 (#8000);
; 3. страницы 3 и 4 (самые короткие, до 7168 байт) читаются в BUF2 (#6400-#7FFF, за загрузчиком; #5C00-#5CFF - системные
;    переменные TR-DOS - читать нельзя) и распаковываются в окно #C000;
; стартовая подпрограмма #FE00 обменяет страницы 5 и 2 (карта встанет на #8000, код - на #4000) и создаст таблицу IM2.
BUF1	EQU	#8000
BUF2	EQU	#6400
	MACRO	LDPG page,file,buf
	LD	A,file
	CALL	LOADF ;в buf (ST_ADR: #80 - BUF1, #64 - BUF2)
	LD	A,page
	CALL	MEM
	LD	HL,buf+2
	LD	DE,#C000
	CALL	DELPZ
	ENDM

	DI
	CALL	SW7
	LDPG	0,6,BUF1
	LDPG	1,7,BUF1
	CALL	OFFD
	CALL	SW5
	XOR	A
	OUT	(254),A
	LDPG	7,9,BUF1
	CALL	SW7
	LDPG	6,13,BUF1
	LDPG	5,12,BUF1 ;4k! карта: #4000-#4FFF
	LD	A,3
	CALL	MEM
	LD	A,8
	CALL	LOADF ;код игры: в окно #C000 страницы 3 (ST_ADR #C0)
	LD	HL,#C002
	LD	DE,#8000
	CALL	DELPZ ;-> живая страница 2
	LDPG	3,10,BUF2
	LDPG	4,11,BUF2
	LD	A,6
	CALL	MEM
	LD	A,(DRIVE) ;игра узнаёт дисковод загрузки (в 1997 году спрашивала)
	CALL	#FE00 ;-->перейти к старту игры в странице 6 (обмен страниц 5 и 2, таблица IM2)

ST_ADR	DEFB	#70,#DB,#C0,#C0,#64,#C0 ;интро (#64: B01 теперь с #6400)
	DEFB	#80,#80,#C0,#80,#64,#64,#80,#80,#C0,#80 ;нач. игры (6..15): #80 - BUF1, #64 - BUF2, #C0 - окно (F8); F15 (концовка) - #80
;#C0-все флики

WA	RLCA
BA	ADD	A,L
	LD	L,A
	JR	NC,B1
	INC	H
B1	LD	A,(HL)
	RET

LOADF ;A-N ф-ла (0..NN)
	PUSH	AF
	LD	D,A
	ADD	A,A
	ADD	A,D
	LD	HL,F_DAT
	CALL	BA
	LD	E,(HL)
	INC	HL
	LD	D,(HL)
	INC	HL
	LD	B,(HL)
	POP	AF
	LD	H,#C0 ;флики
	CP	16
	JR	NC,L16
	LD	HL,ST_ADR ;остальные файлы
	CALL	BA
	LD	H,A
L16	XOR	A
	LD	L,A
RETRY1	CALL	READ
	RET	NC
	DI
	CALL	TR00
	CALL	TR00
	CALL	TR00
	JR	RETRY1

ON256	LD	A,#10
	JR	M2
OFF256	XOR	A
M2	LD	BC,#1FFD
	OUT	(C),A
	RET

;--------------загрузка final-cut
F_CUT ;B=0/1 - победа людей/кунгов
;A=дисковод
	DI
	LD	C,A
	LD	A,#3F ;I - как в ПЗУ: игра оставляла IM2 (I=#BE), а концовке нужен IM 1
	LD	I,A
	LD	A,C
	LD	(DRIVE),A
	PUSH	BC
	LD	D,0
	CALL	POS
	CALL	TR00
	CALL	TR00
	POP	AF
	PUSH	AF
;загр блок мультиков: A
	OR	A
	LD	A,52
	JR	Z,fcc0
	LD	A,58
fcc0	LD	C,-1
	CALL	LOA1fc
	CALL	LOA1fc
	CALL	LOA1fc ;декомпрессия - позднее
;загр гл блока и запуск
	LD	A,15
	CALL	LOADF
	POP	AF
	LD	HL,#8000
	LD	(HL),A
	INC	HL
	JP	(HL)
;
LOA1fc	INC	C
	CALL	LOA2fc
LOA2fc	PUSH	BC
	PUSH	AF
	LD	A,C
	CALL	MEM
	POP	AF
	PUSH	AF
	CALL	LOADF
	POP	AF
	POP	BC
	INC	C
	INC	A
	RET


;===============================

LDREND
	ORG	#6400 ;.B01 (в 1997 году #6200)
	INCLUDE "w_intro.asm"
; *L+
	INCLUDE "w_instr.asm"
WFTXT
	INCBIN "data/wflictxt.zx0"
MUS	EQU	60000
	DEFS	MUS-$,#10
	INCBIN "intro/forgivme.mus"

; *L+
	DEFM	"End of code"
B01END

	MMU 3,3	; page 3 at #C000 ;======3        .B02
	ORG	#C000
	INCBIN "intro/xlag_bl0.dat"
PIKE
	INCBIN "intro/wxlag.zx0"
B02END
	MMU 3,4	; page 4 at #C000 ;======4        .B03
	ORG	#C000
	INCBIN "intro/xlag_bl1.dat"
B03END
	MMU 3,7	; page 7 at #C000 ;======7        .B04
	ORG	#DB00
CROW
	INCBIN "barkov/crow1.zx0"
J45LPZ
	INCBIN "intro/jammy45.zx0"
B04END
	MMU 3,0	; page 0 at #C000 ;======0

;*P0;
;       ORG #C000
;*B ..\INTRO\FLICK.LPZ\WANI3_0.LPZ
;*P1;
;       ORG #C000
;*B ..\INTRO\FLICK.LPZ\WANI3_1.LPZ
;*P3;
;       ORG #C000
;*B ..\INTRO\FLICK.LPZ\WANI4_0.LPZ
;*P4;
;       ORG #C000
;*B ..\INTRO\FLICK.LPZ\WANI4_1.LPZ
;*P6;
;       ORG #C000
;*B ..\INTRO\FLICK.LPZ\WANI5_0.LPZ
;*P7;
;       ORG #C000
;*B ..\INTRO\FLICK.LPZ\WANI5_1.LPZ
;*P0 ;==
